-- =====================================================================
--  نظام إدارة مصنع تشغيل المعادن — قاعدة البيانات (Supabase / Postgres)
--  شغّلي الملف ده مرة واحدة كامل في Supabase ← SQL Editor ← Run
--  الملف آمن لو اتشغل تاني: مش بيمسح بيانات.
-- =====================================================================

create extension if not exists pgcrypto;

-- ───────────────────────── الإعدادات والأدوار ─────────────────────────
create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists roles (
  key text primary key,
  name text not null,
  sort int default 0
);

create table if not exists role_perms (
  role text references roles(key) on delete cascade,
  module text not null,
  can_view boolean default false,
  can_create boolean default false,
  can_edit boolean default false,
  can_delete boolean default false,
  can_approve boolean default false,
  primary key (role, module)
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text references roles(key) default 'none',
  active boolean default false,
  created_at timestamptz default now()
);

-- هل المستخدم الحالي عنده صلاحية؟  act: view | create | edit | delete | approve
create or replace function can(p_module text, p_act text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.active
      and (p.role = 'admin' or exists (
        select 1 from role_perms r where r.role = p.role and r.module = p_module and (
          (p_act = 'view' and r.can_view) or (p_act = 'create' and r.can_create) or
          (p_act = 'edit' and r.can_edit) or (p_act = 'delete' and r.can_delete) or
          (p_act = 'approve' and r.can_approve))))
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin');
$$;

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

-- أول مستخدم يتسجل بيبقى مدير النظام، والباقي بيستنوا المدير يدّيهم صلاحية
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          case when not exists (select 1 from profiles) then 'admin' else 'none' end,
          not exists (select 1 from profiles))
  on conflict (id) do nothing;
  return new;
end $$;

-- ───────────────────────── سجل العمليات ─────────────────────────
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz default now(),
  user_id uuid,
  user_name text,
  table_name text,
  row_id text,
  action text,
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_at on audit_log (at desc);
create index if not exists audit_log_tbl on audit_log (table_name, row_id);

create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id text;
begin
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  v_id := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '');
  insert into audit_log (user_id, user_name, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), v_name, tg_table_name, v_id, lower(tg_op),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function touch_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ───────────────────────── ترقيم المستندات ─────────────────────────
create table if not exists doc_counters (
  prefix text, year int, last int default 0, primary key (prefix, year)
);

create or replace function next_doc_no(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now())::int; v_n int;
begin
  insert into doc_counters (prefix, year, last) values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last = doc_counters.last + 1
  returning last into v_n;
  return p_prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
end $$;

create or replace function set_doc_no() returns trigger language plpgsql as $$
begin
  if new.no is null or new.no = '' then new.no := next_doc_no(tg_argv[0]); end if;
  return new;
end $$;

-- ───────────────────────── البيانات الأساسية ─────────────────────────
-- أنواع الخامات (المعادن)
create table if not exists material_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text,              -- حديد كربوني / ستانلس / ألومنيوم / نحاس ...
  grade text,               -- ST37 / SS304 / 6061 ...
  standard text,            -- DIN / ASTM / EN
  density numeric default 7850,   -- كجم / م³
  forms text,               -- الأشكال المتاحة
  price_per_ton numeric default 0,
  color text,
  notes text,
  active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  code text, name text not null,
  kind text default 'general' check (kind in ('raw','wip','finished','scrap','spares','general')),
  location text, keeper text, notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);

-- العملاء والموردين ومشتري الخردة
create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  code text, name text not null,
  kind text default 'customer' check (kind in ('customer','supplier','both','scrap_buyer')),
  contact_person text, phone text, phone2 text, email text, address text, tax_no text, commercial_reg text,
  opening_balance numeric default 0,   -- موجب = عليه لينا ، سالب = لينا عليه
  credit_limit numeric default 0, payment_terms text, notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  code text unique, name text not null,
  kind text default 'raw' check (kind in ('raw','wip','finished','scrap','consumable','spare')),
  material_type_id uuid references material_types(id),
  form text, grade text, size text,
  thickness numeric, length numeric, width numeric, diameter numeric,   -- مم
  weight_per_unit numeric,                                             -- كجم للوحدة
  unit text default 'kg' check (unit in ('ton','kg','piece','meter','sheet','m2','liter','set')),
  supplier_id uuid references parties(id),
  avg_cost numeric default 0, sale_price numeric default 0, reorder_level numeric default 0,
  barcode text, location text, image_url text, attachments jsonb default '[]'::jsonb, notes text,
  active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create index if not exists items_barcode on items (barcode);

-- ───────────────────────── المخزون ─────────────────────────
-- كل حركة دخول (+) أو خروج (−) لأي صنف في أي مخزن
create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  move_date date default current_date,
  item_id uuid not null references items(id),
  warehouse_id uuid not null references warehouses(id),
  batch_no text,
  qty numeric not null,
  unit_cost numeric default 0,
  doc_type text, doc_id uuid, doc_no text, reason text, location text,
  work_order_id uuid, party_id uuid,
  created_at timestamptz default now(), created_by uuid default auth.uid()
);
create index if not exists sm_item on stock_moves (item_id, warehouse_id);
create index if not exists sm_doc on stock_moves (doc_type, doc_id);
create index if not exists sm_batch on stock_moves (batch_no);
create index if not exists sm_wo on stock_moves (work_order_id);
create index if not exists sm_date on stock_moves (move_date);

-- أذون المخزن: إضافة / صرف / تحويل / مرتجع / تسوية / جرد / استلام إنتاج
create table if not exists stock_docs (
  id uuid primary key default gen_random_uuid(),
  no text unique, doc_date date default current_date,
  kind text not null check (kind in ('add','issue','transfer','return','adjust','count','production')),
  warehouse_id uuid references warehouses(id),
  to_warehouse_id uuid references warehouses(id),
  work_order_id uuid, party_id uuid references parties(id),
  reason text, notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists stock_doc_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references stock_docs(id) on delete cascade,
  item_id uuid not null references items(id),
  batch_no text, qty numeric default 0, counted_qty numeric, unit_cost numeric, location text, notes text,
  sort int default 0
);

-- ───────────────────────── البوابة: الداخل والخارج ─────────────────────────
create table if not exists gate_in (
  id uuid primary key default gen_random_uuid(),
  no text unique, entry_at timestamptz default now(),
  supplier_id uuid references parties(id),
  vehicle_no text, driver_name text, driver_phone text,
  material_desc text,
  gross_weight numeric default 0, tare_weight numeric default 0,
  net_weight numeric generated always as (coalesce(gross_weight,0) - coalesce(tare_weight,0)) stored,
  po_id uuid, warehouse_id uuid references warehouses(id),
  receiver_name text, notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists gate_in_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references gate_in(id) on delete cascade,
  item_id uuid not null references items(id),
  qty numeric default 0, weight numeric, unit_cost numeric default 0, batch_no text, notes text, sort int default 0
);

create table if not exists gate_out (
  id uuid primary key default gen_random_uuid(),
  no text unique, exit_at timestamptz default now(),
  customer_id uuid references parties(id),
  sales_order_id uuid, invoice_id uuid,
  vehicle_id uuid, vehicle_no text, driver_id uuid, driver_name text,
  warehouse_id uuid references warehouses(id),
  loading_info text, delivered_by text,
  collection_status text default 'pending' check (collection_status in ('pending','partial','collected')),
  notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists gate_out_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references gate_out(id) on delete cascade,
  item_id uuid not null references items(id),
  batch_no text, qty numeric default 0, weight numeric, notes text, sort int default 0
);

-- ───────────────────────── الماكينات والموظفين ─────────────────────────
create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  code text, name text not null, department text, kind text, brand text,
  purchase_date date, hour_rate numeric default 0, hours_run numeric default 0,
  status text default 'working' check (status in ('working','stopped','maintenance')),
  maintenance_every_days int, next_maintenance_date date, technician text, notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists machine_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date default current_date,
  machine_id uuid not null references machines(id) on delete cascade,
  kind text default 'preventive' check (kind in ('preventive','breakdown','repair','parts','inspection')),
  description text, parts_used text, cost numeric default 0, downtime_hours numeric default 0,
  technician text, next_due_date date, notes text,
  created_at timestamptz default now(), created_by uuid default auth.uid()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  code text, name text not null, phone text, address text,
  department text, job_title text, hire_date date,
  salary numeric default 0, pay_period text default 'monthly' check (pay_period in ('monthly','weekly','daily')),
  hour_rate numeric default 0, notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  att_date date default current_date,
  employee_id uuid not null references employees(id) on delete cascade,
  check_in time, check_out time,
  status text default 'present' check (status in ('present','absent','late','leave','holiday','mission')),
  overtime_hours numeric default 0, notes text,
  created_at timestamptz default now(), created_by uuid default auth.uid(),
  unique (employee_id, att_date)
);
create table if not exists employee_transactions (
  id uuid primary key default gen_random_uuid(),
  tx_date date default current_date,
  employee_id uuid not null references employees(id) on delete cascade,
  kind text not null check (kind in ('advance','deduction','overtime','bonus','leave','salary_payment')),
  amount numeric default 0, days numeric, cashbox_id uuid, notes text,
  created_at timestamptz default now(), created_by uuid default auth.uid()
);

-- ───────────────────────── التشغيل والإنتاج ─────────────────────────
create table if not exists process_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null, sort int default 0, notes text, active boolean default true,
  created_at timestamptz default now()
);

create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  no text unique,
  customer_id uuid references parties(id), project text,
  product_item_id uuid references items(id), qty_required numeric default 0,
  raw_item_id uuid references items(id), raw_qty_required numeric default 0,
  start_date date default current_date, due_date date,
  machine_id uuid references machines(id), responsible text,
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  status text default 'new' check (status in ('new','preparing','running','inspection','completed','delivered','cancelled')),
  labor_cost numeric default 0, machine_cost numeric default 0, energy_cost numeric default 0,
  transport_cost numeric default 0, other_cost numeric default 0,
  sale_price_total numeric default 0,
  notes text, attachments jsonb default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists wo_stages (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references work_orders(id) on delete cascade,
  stage_id uuid references process_stages(id),
  machine_id uuid references machines(id), employee_id uuid references employees(id), worker_name text,
  started_at timestamptz, ended_at timestamptz, qty_done numeric default 0,
  status text default 'pending' check (status in ('pending','running','done')),
  notes text, sort int default 0
);
alter table stock_docs drop constraint if exists stock_docs_wo_fk;
alter table stock_docs add constraint stock_docs_wo_fk foreign key (work_order_id) references work_orders(id);

-- الجودة
create table if not exists qc_inspections (
  id uuid primary key default gen_random_uuid(),
  no text unique, insp_date date default current_date,
  wo_id uuid references work_orders(id), item_id uuid references items(id),
  spec text, qty_inspected numeric default 0, qty_accepted numeric default 0, qty_rejected numeric default 0,
  reject_reason text,
  decision text default 'accept' check (decision in ('accept','rework','scrap','return','conditional')),
  inspector text, notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);

-- الهالك والخردة
create table if not exists scrap_records (
  id uuid primary key default gen_random_uuid(),
  no text unique, rec_date date default current_date,
  scrap_type text,
  source text default 'production' check (source in ('production','cutting','damaged','returned','qc','other')),
  wo_id uuid references work_orders(id), machine_id uuid references machines(id),
  item_id uuid references items(id), warehouse_id uuid references warehouses(id),
  weight numeric default 0, est_value numeric default 0, notes text,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists scrap_sales (
  id uuid primary key default gen_random_uuid(),
  no text unique, sale_date date default current_date,
  buyer_id uuid references parties(id), warehouse_id uuid references warehouses(id),
  vehicle_no text, notes text, subtotal numeric default 0, total numeric default 0,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists scrap_sale_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references scrap_sales(id) on delete cascade,
  item_id uuid not null references items(id), batch_no text,
  qty numeric default 0, price numeric default 0, notes text, sort int default 0
);

-- ───────────────────────── المشتريات ─────────────────────────
create table if not exists purchase_requests (
  id uuid primary key default gen_random_uuid(),
  no text unique, req_date date default current_date,
  requested_by text, department text, needed_by date, reason text, notes text,
  status text default 'draft' check (status in ('draft','approved','ordered','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists pr_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references purchase_requests(id) on delete cascade,
  item_id uuid not null references items(id), qty numeric default 0, notes text, sort int default 0
);
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  no text unique, po_date date default current_date,
  supplier_id uuid references parties(id), pr_id uuid references purchase_requests(id),
  expected_date date, payment_terms text,
  tax_rate numeric default 0, transport_cost numeric default 0, discount numeric default 0,
  subtotal numeric default 0, tax_amount numeric default 0, total numeric default 0,
  notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','partial','received','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists po_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id), qty numeric default 0, price numeric default 0,
  received_qty numeric default 0, notes text, sort int default 0
);
alter table gate_in drop constraint if exists gate_in_po_fk;
alter table gate_in add constraint gate_in_po_fk foreign key (po_id) references purchase_orders(id);

create table if not exists supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  no text unique, supplier_ref text, inv_date date default current_date, due_date date,
  supplier_id uuid references parties(id), po_id uuid references purchase_orders(id), gate_in_id uuid references gate_in(id),
  tax_rate numeric default 0, transport_cost numeric default 0, discount numeric default 0,
  subtotal numeric default 0, tax_amount numeric default 0, total numeric default 0,
  notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists sinv_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references supplier_invoices(id) on delete cascade,
  item_id uuid references items(id), description text, qty numeric default 0, price numeric default 0, notes text, sort int default 0
);

-- ───────────────────────── المبيعات ─────────────────────────
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  no text unique, q_date date default current_date, valid_until date,
  customer_id uuid references parties(id), project text,
  tax_rate numeric default 0, discount numeric default 0, transport_cost numeric default 0,
  subtotal numeric default 0, tax_amount numeric default 0, total numeric default 0,
  terms text, notes text,
  status text default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists quotation_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references quotations(id) on delete cascade,
  item_id uuid references items(id), description text, qty numeric default 0, price numeric default 0, notes text, sort int default 0
);
create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  no text unique, so_date date default current_date, delivery_date date,
  customer_id uuid references parties(id), quotation_id uuid references quotations(id), project text,
  tax_rate numeric default 0, discount numeric default 0, transport_cost numeric default 0,
  subtotal numeric default 0, tax_amount numeric default 0, total numeric default 0,
  notes text,
  status text default 'draft' check (status in ('draft','approved','in_production','delivered','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists so_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references sales_orders(id) on delete cascade,
  item_id uuid references items(id), description text, qty numeric default 0, price numeric default 0, notes text, sort int default 0
);
create table if not exists sales_invoices (
  id uuid primary key default gen_random_uuid(),
  no text unique, inv_date date default current_date, due_date date,
  customer_id uuid references parties(id), so_id uuid references sales_orders(id), gate_out_id uuid references gate_out(id),
  tax_rate numeric default 0, discount numeric default 0, transport_cost numeric default 0,
  subtotal numeric default 0, tax_amount numeric default 0, total numeric default 0,
  notes text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists si_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references sales_invoices(id) on delete cascade,
  item_id uuid references items(id), description text, qty numeric default 0, price numeric default 0, notes text, sort int default 0
);
alter table gate_out drop constraint if exists gate_out_so_fk;
alter table gate_out add constraint gate_out_so_fk foreign key (sales_order_id) references sales_orders(id);

-- ───────────────────────── الخزينة والمصروفات ─────────────────────────
create table if not exists cashboxes (
  id uuid primary key default gen_random_uuid(),
  name text not null, kind text default 'cash' check (kind in ('cash','bank','wallet')),
  bank_name text, account_no text, opening_balance numeric default 0, notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);

-- السيارات والسائقين (قبل الخزينة عشان الربط)
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null, kind text, model text, year int, capacity_ton numeric,
  driver_id uuid, odometer numeric default 0, fuel_type text default 'diesel',
  license_expiry date, insurance_expiry date,
  next_service_date date, next_service_km numeric, next_oil_date date, next_oil_km numeric,
  notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, license_no text, license_expiry date,
  vehicle_id uuid references vehicles(id),
  pay_type text default 'per_trip' check (pay_type in ('salary','per_trip','mixed')),
  salary numeric default 0, opening_balance numeric default 0, notes text, active boolean default true,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
alter table vehicles drop constraint if exists vehicles_driver_fk;
alter table vehicles add constraint vehicles_driver_fk foreign key (driver_id) references drivers(id) on delete set null;
alter table gate_out drop constraint if exists gate_out_vehicle_fk;
alter table gate_out add constraint gate_out_vehicle_fk foreign key (vehicle_id) references vehicles(id);
alter table gate_out drop constraint if exists gate_out_driver_fk;
alter table gate_out add constraint gate_out_driver_fk foreign key (driver_id) references drivers(id);

create table if not exists vehicle_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date default current_date,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  kind text default 'maintenance' check (kind in ('maintenance','oil','tires','fuel','breakdown','license','insurance','other')),
  odometer numeric, liters numeric, cost numeric default 0, next_due_date date, next_due_km numeric,
  workshop text, notes text, attachments jsonb default '[]'::jsonb,
  created_at timestamptz default now(), created_by uuid default auth.uid()
);
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  no text unique, trip_date date default current_date,
  driver_id uuid not null references drivers(id), vehicle_id uuid references vehicles(id),
  from_place text, to_place text, party_id uuid references parties(id), load_ref text,
  gate_out_id uuid references gate_out(id), gate_in_id uuid references gate_in(id),
  distance_km numeric, fare numeric default 0, fuel numeric default 0, tolls numeric default 0, other_exp numeric default 0,
  advance numeric default 0, cashbox_id uuid references cashboxes(id), notes text,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists driver_transactions (
  id uuid primary key default gen_random_uuid(),
  tx_date date default current_date,
  driver_id uuid not null references drivers(id) on delete cascade,
  kind text not null check (kind in ('advance','deduction','bonus','salary')),
  amount numeric default 0, cashbox_id uuid references cashboxes(id), notes text,
  created_at timestamptz default now(), created_by uuid default auth.uid()
);

create table if not exists cash_transactions (
  id uuid primary key default gen_random_uuid(),
  no text unique, tx_date date default current_date,
  kind text not null check (kind in ('receipt','payment','transfer')),
  cashbox_id uuid not null references cashboxes(id), to_cashbox_id uuid references cashboxes(id),
  party_type text default 'other' check (party_type in ('customer','supplier','driver','employee','other')),
  party_id uuid references parties(id), driver_id uuid references drivers(id), employee_id uuid references employees(id),
  amount numeric not null default 0,
  method text default 'cash' check (method in ('cash','transfer','cheque','wallet')),
  reference text, cheque_due date, description text, attachments jsonb default '[]'::jsonb,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);
alter table employee_transactions drop constraint if exists emp_tx_cash_fk;
alter table employee_transactions add constraint emp_tx_cash_fk foreign key (cashbox_id) references cashboxes(id);

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, kind text default 'operating', sort int default 0, active boolean default true
);
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  no text unique, exp_date date default current_date,
  category text not null, description text, amount numeric not null default 0,
  cashbox_id uuid references cashboxes(id), party_id uuid references parties(id),
  vehicle_id uuid references vehicles(id), machine_id uuid references machines(id), wo_id uuid references work_orders(id),
  paid_to text, receipt_no text, attachments jsonb default '[]'::jsonb, notes text,
  status text default 'draft' check (status in ('draft','approved','cancelled')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), created_by uuid default auth.uid(), updated_at timestamptz default now()
);

-- ───────────────────────── المحرّكات (Triggers) ─────────────────────────
do $$
declare t text; p text;
begin
  -- ترقيم تلقائي
  for t, p in select * from (values
    ('stock_docs','ST'),('gate_in','GI'),('gate_out','GO'),('work_orders','WO'),('qc_inspections','QC'),
    ('scrap_records','SC'),('scrap_sales','SS'),('purchase_requests','PR'),('purchase_orders','PO'),
    ('supplier_invoices','PI'),('quotations','QT'),('sales_orders','SO'),('sales_invoices','SI'),
    ('cash_transactions','CT'),('expenses','EX'),('trips','TR')) v(a,b)
  loop
    execute format('drop trigger if exists trg_no on %I', t);
    execute format('create trigger trg_no before insert on %I for each row execute function set_doc_no(%L)', t, p);
  end loop;

  -- updated_at + سجل العمليات
  for t in select unnest(array[
    'settings','role_perms','profiles','material_types','warehouses','parties','items','stock_docs','stock_doc_lines',
    'gate_in','gate_in_lines','gate_out','gate_out_lines','machines','machine_logs','employees','attendance',
    'employee_transactions','process_stages','work_orders','wo_stages','qc_inspections','scrap_records','scrap_sales',
    'scrap_sale_lines','purchase_requests','pr_lines','purchase_orders','po_lines','supplier_invoices','sinv_lines',
    'quotations','quotation_lines','sales_orders','so_lines','sales_invoices','si_lines','cashboxes','vehicles','drivers',
    'vehicle_logs','trips','driver_transactions','cash_transactions','expense_categories','expenses'])
  loop
    execute format('drop trigger if exists trg_audit on %I', t);
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit_trigger()', t);
  end loop;

  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at'
             and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')
  loop
    execute format('drop trigger if exists trg_touch on %I', t);
    execute format('create trigger trg_touch before update on %I for each row execute function touch_updated()', t);
  end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- منع تعديل المستند بعد اعتماده (إلا من جوه دوال الاعتماد)
create or replace function lock_posted() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.posting', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.status = 'approved' then raise exception 'المستند % معتمد — لازم تلغي الاعتماد الأول قبل الحذف', old.no; end if;
    return old;
  end if;
  -- حالة التحصيل في إذن الخروج تتعدل حتى بعد الاعتماد
  if old.status = 'approved' and (to_jsonb(new) - array['collection_status','updated_at']) = (to_jsonb(old) - array['collection_status','updated_at']) then
    return new;
  end if;
  if old.status = 'approved' then
    raise exception 'المستند % معتمد ومينفعش يتعدل — الغي الاعتماد الأول', old.no;
  end if;
  if new.status is distinct from old.status and new.status in ('approved','cancelled') then
    raise exception 'الاعتماد أو الإلغاء بيتم من زرار «اعتماد» بس';
  end if;
  return new;
end $$;

create or replace function lock_posted_lines() returns trigger language plpgsql as $$
declare v_status text; v_doc uuid := coalesce(new.doc_id, old.doc_id);
begin
  if coalesce(current_setting('app.posting', true), '') = 'on' then return coalesce(new, old); end if;
  execute format('select status from %I where id = $1', tg_argv[0]) into v_status using v_doc;
  if v_status = 'approved' then raise exception 'المستند معتمد ومينفعش تعدل أصنافه'; end if;
  return coalesce(new, old);
end $$;

do $$
declare t text; l text;
begin
  for t in select unnest(array['stock_docs','gate_in','gate_out','qc_inspections','scrap_records','scrap_sales',
    'supplier_invoices','sales_invoices','cash_transactions','expenses','trips'])
  loop
    execute format('drop trigger if exists trg_lock on %I', t);
    execute format('create trigger trg_lock before update or delete on %I for each row execute function lock_posted()', t);
  end loop;
  for t, l in select * from (values ('stock_doc_lines','stock_docs'),('gate_in_lines','gate_in'),('gate_out_lines','gate_out'),
    ('scrap_sale_lines','scrap_sales'),('sinv_lines','supplier_invoices'),('si_lines','sales_invoices')) v(a,b)
  loop
    execute format('drop trigger if exists trg_lock on %I', t);
    execute format('create trigger trg_lock before insert or update or delete on %I for each row execute function lock_posted_lines(%L)', t, l);
  end loop;
end $$;

-- ───────────────────────── دوال المخزون ─────────────────────────
create or replace function stock_qty(p_item uuid, p_wh uuid, p_batch text default null) returns numeric
language sql stable as $$
  select coalesce(sum(qty), 0) from stock_moves
  where item_id = p_item and warehouse_id = p_wh and (p_batch is null or batch_no = p_batch);
$$;

create or replace function recalc_avg_cost(p_item uuid) returns void language plpgsql as $$
declare v numeric;
begin
  select case when sum(qty) > 0 then sum(qty * unit_cost) / sum(qty) end into v
  from stock_moves where item_id = p_item and qty > 0 and coalesce(unit_cost, 0) > 0;
  if v is not null then update items set avg_cost = round(v, 4) where id = p_item; end if;
end $$;

-- إضافة حركة مخزون مع منع الرصيد السالب
create or replace function add_move(p_item uuid, p_wh uuid, p_qty numeric, p_cost numeric, p_batch text,
  p_doc_type text, p_doc_id uuid, p_doc_no text, p_date date, p_reason text default null,
  p_wo uuid default null, p_party uuid default null, p_location text default null) returns void
language plpgsql as $$
declare v_allow boolean; v_bal numeric; v_name text; v_wh text;
begin
  if p_qty = 0 or p_qty is null then return; end if;
  if p_wh is null then raise exception 'لازم تختار المخزن'; end if;
  insert into stock_moves (move_date, item_id, warehouse_id, batch_no, qty, unit_cost, doc_type, doc_id, doc_no, reason, work_order_id, party_id, location)
  values (coalesce(p_date, current_date), p_item, p_wh, nullif(p_batch, ''), p_qty,
          coalesce(p_cost, (select avg_cost from items where id = p_item), 0),
          p_doc_type, p_doc_id, p_doc_no, p_reason, p_wo, p_party, p_location);
  if p_qty < 0 then
    select coalesce((value->>'allow_negative')::boolean, false) into v_allow from settings where key = 'stock';
    if not coalesce(v_allow, false) then
      v_bal := stock_qty(p_item, p_wh, null);
      if v_bal < 0 or (nullif(p_batch, '') is not null and stock_qty(p_item, p_wh, p_batch) < 0) then
        select name into v_name from items where id = p_item;
        select name into v_wh from warehouses where id = p_wh;
        raise exception 'الرصيد مش كفاية: «%» في «%» — المتاح % والمطلوب %', v_name, v_wh, round(v_bal - p_qty, 3), round(-p_qty, 3);
      end if;
    end if;
  else
    perform recalc_avg_cost(p_item);
  end if;
end $$;

-- حساب إجماليات أي مستند فيه أسعار
create or replace function recalc_totals(p_table text, p_lines text, p_id uuid) returns void language plpgsql as $$
declare v_sub numeric; v_disc numeric := 0; v_trans numeric := 0; v_rate numeric := 0; v_tax numeric;
begin
  execute format('select coalesce(sum(coalesce(qty,0) * coalesce(price,0)), 0) from %I where doc_id = $1', p_lines) into v_sub using p_id;
  execute format('select coalesce(discount,0), coalesce(transport_cost,0), coalesce(tax_rate,0) from %I where id = $1', p_table)
    into v_disc, v_trans, v_rate using p_id;
  v_tax := round((v_sub - v_disc + v_trans) * v_rate / 100, 2);
  execute format('update %I set subtotal = $2, tax_amount = $3, total = $2 - $4 + $5 + $3 where id = $1', p_table)
    using p_id, v_sub, v_tax, v_disc, v_trans;
end $$;

create or replace function table_module(p_table text) returns text language sql immutable as $$
  select case p_table
    when 'stock_docs' then 'stock' when 'gate_in' then 'gate_in' when 'gate_out' then 'gate_out'
    when 'qc_inspections' then 'quality' when 'scrap_records' then 'scrap' when 'scrap_sales' then 'scrap'
    when 'purchase_requests' then 'purchasing' when 'purchase_orders' then 'purchasing' when 'supplier_invoices' then 'purchasing'
    when 'quotations' then 'sales' when 'sales_orders' then 'sales' when 'sales_invoices' then 'sales'
    when 'cash_transactions' then 'treasury' when 'expenses' then 'expenses' when 'trips' then 'drivers'
    else p_table end;
$$;

-- ═══════════════ اعتماد مستند (ترحيل للمخزون والحسابات) ═══════════════
create or replace function approve_doc(p_table text, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare d record; l record; v_bal numeric; v_batch text; v_cnt int; v_left int; v_unit numeric;
begin
  if not can(table_module(p_table), 'approve') then raise exception 'مالكش صلاحية اعتماد في القسم ده'; end if;
  perform set_config('app.posting', 'on', true);

  if p_table = 'stock_docs' then
    select * into d from stock_docs where id = p_id for update;
    if d.status <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    select count(*) into v_cnt from stock_doc_lines where doc_id = p_id;
    if v_cnt = 0 then raise exception 'المستند مفيهوش أصناف'; end if;
    for l in select * from stock_doc_lines where doc_id = p_id order by sort, id loop
      v_batch := l.batch_no;
      if d.kind in ('add','return') then
        perform add_move(l.item_id, d.warehouse_id, abs(l.qty), l.unit_cost, v_batch, 'stock_docs', d.id, d.no, d.doc_date, coalesce(d.reason, d.kind), d.work_order_id, d.party_id, l.location);
      elsif d.kind = 'production' then
        v_batch := coalesce(nullif(l.batch_no,''), (select no from work_orders where id = d.work_order_id), d.no);
        update stock_doc_lines set batch_no = v_batch where id = l.id;
        -- تكلفة الوحدة المنتجة = تكلفة أمر التشغيل لحد دلوقتي ÷ الكمية المنتجة
        v_unit := l.unit_cost;
        if coalesce(v_unit, 0) = 0 and d.work_order_id is not null then
          select total_cost / nullif(produced_qty + (select sum(abs(qty)) from stock_doc_lines where doc_id = p_id), 0)
            into v_unit from v_wo_cost where wo_id = d.work_order_id;
        end if;
        perform add_move(l.item_id, coalesce(d.to_warehouse_id, d.warehouse_id), abs(l.qty), v_unit, v_batch, 'stock_docs', d.id, d.no, d.doc_date, 'استلام إنتاج', d.work_order_id, d.party_id, l.location);
      elsif d.kind = 'issue' then
        perform add_move(l.item_id, d.warehouse_id, -abs(l.qty), null, v_batch, 'stock_docs', d.id, d.no, d.doc_date, coalesce(d.reason, 'صرف'), d.work_order_id, d.party_id, l.location);
      elsif d.kind = 'transfer' then
        if d.to_warehouse_id is null then raise exception 'اختار المخزن المحوَّل إليه'; end if;
        perform add_move(l.item_id, d.warehouse_id, -abs(l.qty), null, v_batch, 'stock_docs', d.id, d.no, d.doc_date, 'تحويل', d.work_order_id, null, l.location);
        perform add_move(l.item_id, d.to_warehouse_id, abs(l.qty), (select avg_cost from items where id = l.item_id), v_batch, 'stock_docs', d.id, d.no, d.doc_date, 'تحويل', d.work_order_id, null, l.location);
      elsif d.kind = 'adjust' then
        perform add_move(l.item_id, d.warehouse_id, l.qty, l.unit_cost, v_batch, 'stock_docs', d.id, d.no, d.doc_date, coalesce(d.reason, 'تسوية'), null, null, l.location);
      elsif d.kind = 'count' then
        v_bal := stock_qty(l.item_id, d.warehouse_id, nullif(v_batch, ''));
        update stock_doc_lines set qty = coalesce(l.counted_qty, 0) - v_bal where id = l.id;
        perform add_move(l.item_id, d.warehouse_id, coalesce(l.counted_qty, 0) - v_bal, null, v_batch, 'stock_docs', d.id, d.no, d.doc_date, 'فرق جرد', null, null, l.location);
      end if;
    end loop;
    update stock_docs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
    if d.kind = 'issue' and d.work_order_id is not null then
      update work_orders set status = 'running' where id = d.work_order_id and status in ('new','preparing');
    end if;

  elsif p_table = 'gate_in' then
    select * into d from gate_in where id = p_id for update;
    if d.status <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    select count(*) into v_cnt from gate_in_lines where doc_id = p_id;
    if v_cnt = 0 then raise exception 'إذن الدخول مفيهوش أصناف'; end if;
    v_cnt := 0;
    for l in select * from gate_in_lines where doc_id = p_id order by sort, id loop
      v_cnt := v_cnt + 1;
      v_batch := coalesce(nullif(l.batch_no, ''), d.no || case when v_cnt > 1 then '-' || v_cnt else '' end);
      update gate_in_lines set batch_no = v_batch where id = l.id;
      perform add_move(l.item_id, d.warehouse_id, l.qty, l.unit_cost, v_batch, 'gate_in', d.id, d.no, d.entry_at::date, 'استلام خامات', null, d.supplier_id, null);
      if d.po_id is not null then
        update po_lines set received_qty = coalesce(received_qty, 0) + l.qty where doc_id = d.po_id and item_id = l.item_id;
      end if;
    end loop;
    if d.po_id is not null then
      select count(*) filter (where coalesce(received_qty,0) < qty) into v_left from po_lines where doc_id = d.po_id;
      update purchase_orders set status = case when v_left = 0 then 'received' else 'partial' end where id = d.po_id;
    end if;
    update gate_in set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;

  elsif p_table = 'gate_out' then
    select * into d from gate_out where id = p_id for update;
    if d.status <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    select count(*) into v_cnt from gate_out_lines where doc_id = p_id;
    if v_cnt = 0 then raise exception 'إذن الخروج مفيهوش أصناف'; end if;
    for l in select * from gate_out_lines where doc_id = p_id order by sort, id loop
      perform add_move(l.item_id, d.warehouse_id, -abs(l.qty), null, l.batch_no, 'gate_out', d.id, d.no, d.exit_at::date, 'خروج للعميل', null, d.customer_id, null);
    end loop;
    update gate_out set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
    if d.sales_order_id is not null then update sales_orders set status = 'delivered' where id = d.sales_order_id; end if;

  elsif p_table = 'scrap_records' then
    select * into d from scrap_records where id = p_id for update;
    if d.status <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    if d.item_id is not null and d.warehouse_id is not null and coalesce(d.weight, 0) > 0 then
      perform add_move(d.item_id, d.warehouse_id, d.weight, case when d.weight > 0 then d.est_value / d.weight else 0 end,
        coalesce((select no from work_orders where id = d.wo_id), d.no), 'scrap_records', d.id, d.no, d.rec_date, 'تسجيل هالك', d.wo_id, null, null);
    end if;
    update scrap_records set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;

  elsif p_table = 'scrap_sales' then
    select * into d from scrap_sales where id = p_id for update;
    if d.status <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    for l in select * from scrap_sale_lines where doc_id = p_id loop
      perform add_move(l.item_id, d.warehouse_id, -abs(l.qty), null, l.batch_no, 'scrap_sales', d.id, d.no, d.sale_date, 'بيع خردة', null, d.buyer_id, null);
    end loop;
    update scrap_sales set subtotal = (select coalesce(sum(qty*price),0) from scrap_sale_lines where doc_id = p_id),
                           total = (select coalesce(sum(qty*price),0) from scrap_sale_lines where doc_id = p_id),
                           status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;

  elsif p_table in ('supplier_invoices','sales_invoices') then
    execute format('select status from %I where id = $1 for update', p_table) into v_batch using p_id;
    if v_batch <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    perform recalc_totals(p_table, case p_table when 'supplier_invoices' then 'sinv_lines' else 'si_lines' end, p_id);
    execute format('update %I set status = ''approved'', approved_by = auth.uid(), approved_at = now() where id = $1', p_table) using p_id;

  elsif p_table in ('cash_transactions','expenses','trips','qc_inspections') then
    execute format('select status from %I where id = $1 for update', p_table) into v_batch using p_id;
    if v_batch <> 'draft' then raise exception 'المستند مش مسودة'; end if;
    if p_table = 'cash_transactions' then
      select * into d from cash_transactions where id = p_id;
      if d.amount <= 0 then raise exception 'المبلغ لازم يكون أكبر من صفر'; end if;
      if d.kind = 'transfer' and (d.to_cashbox_id is null or d.to_cashbox_id = d.cashbox_id) then raise exception 'اختار خزينة تانية للتحويل'; end if;
    end if;
    execute format('update %I set status = ''approved'', approved_by = auth.uid(), approved_at = now() where id = $1', p_table) using p_id;

  elsif p_table in ('purchase_requests','purchase_orders','sales_orders') then
    if p_table = 'purchase_orders' then perform recalc_totals('purchase_orders', 'po_lines', p_id); end if;
    if p_table = 'sales_orders' then perform recalc_totals('sales_orders', 'so_lines', p_id); end if;
    execute format('update %I set status = ''approved'', approved_by = auth.uid(), approved_at = now() where id = $1 and status = ''draft''', p_table) using p_id;
  else
    raise exception 'نوع مستند غير معروف: %', p_table;
  end if;

  perform set_config('app.posting', 'off', true);
  return 'ok';
end $$;

-- ═══════════════ إلغاء الاعتماد (يرجّع المستند مسودة ويشيل حركاته) ═══════════════
create or replace function unapprove_doc(p_table text, p_id uuid, p_cancel boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare m record; l record; v_status text; v_allow boolean; v_po uuid; v_left int;
begin
  if not can(table_module(p_table), 'approve') then raise exception 'مالكش صلاحية في القسم ده'; end if;
  perform set_config('app.posting', 'on', true);
  execute format('select status from %I where id = $1 for update', p_table) into v_status using p_id;
  if v_status is null then raise exception 'المستند مش موجود'; end if;

  if p_table = 'gate_in' and v_status = 'approved' then
    select po_id into v_po from gate_in where id = p_id;
    if v_po is not null then
      for l in select item_id, sum(qty) q from gate_in_lines where doc_id = p_id group by item_id loop
        update po_lines set received_qty = greatest(coalesce(received_qty,0) - l.q, 0) where doc_id = v_po and item_id = l.item_id;
      end loop;
      select count(*) filter (where coalesce(received_qty,0) > 0) into v_left from po_lines where doc_id = v_po;
      update purchase_orders set status = case when v_left = 0 then 'approved' else 'partial' end where id = v_po;
    end if;
  end if;

  -- نشيل حركات المخزون ونتأكد إن مفيش رصيد هيبقى بالسالب
  create temp table if not exists _aff (item_id uuid, warehouse_id uuid) on commit drop;
  delete from _aff;
  insert into _aff select distinct item_id, warehouse_id from stock_moves where doc_type = p_table and doc_id = p_id;
  delete from stock_moves where doc_type = p_table and doc_id = p_id;
  select coalesce((value->>'allow_negative')::boolean, false) into v_allow from settings where key = 'stock';
  if not coalesce(v_allow, false) then
    for m in select a.item_id, a.warehouse_id, stock_qty(a.item_id, a.warehouse_id) q from _aff a loop
      if m.q < 0 then
        raise exception 'مينفعش تلغي: الكمية دي اتصرفت بالفعل من «%» (الرصيد هيبقى %)',
          (select name from items where id = m.item_id), round(m.q, 3);
      end if;
    end loop;
  end if;
  for m in select distinct item_id from _aff loop perform recalc_avg_cost(m.item_id); end loop;

  execute format('update %I set status = $2, approved_by = null, approved_at = null where id = $1', p_table)
    using p_id, case when p_cancel then 'cancelled' else 'draft' end;
  perform set_config('app.posting', 'off', true);
  return 'ok';
end $$;

-- ───────────────────────── تحديثات تلقائية ─────────────────────────
create or replace function item_defaults() returns trigger language plpgsql as $$
begin
  if new.barcode is null or new.barcode = '' then new.barcode := new.code; end if;
  return new;
end $$;
drop trigger if exists trg_item_defaults on items;
create trigger trg_item_defaults before insert or update on items for each row execute function item_defaults();

-- سجل الماكينة بيحدّث موعد الصيانة الجاية
create or replace function machine_log_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare v_every int;
begin
  select maintenance_every_days into v_every from machines where id = new.machine_id;
  update machines set
    next_maintenance_date = coalesce(new.next_due_date, case when new.kind = 'preventive' and v_every is not null then new.log_date + v_every end, next_maintenance_date),
    status = case when new.kind = 'breakdown' then 'maintenance' when new.kind in ('repair','preventive') and status = 'maintenance' then 'working' else status end
  where id = new.machine_id;
  return new;
end $$;
drop trigger if exists trg_machine_log on machine_logs;
create trigger trg_machine_log after insert on machine_logs for each row execute function machine_log_sync();

-- سجل السيارة بيحدّث العداد والمواعيد
create or replace function vehicle_log_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update vehicles set
    odometer = greatest(coalesce(odometer, 0), coalesce(new.odometer, 0)),
    next_oil_date = case when new.kind = 'oil' then coalesce(new.next_due_date, next_oil_date) else next_oil_date end,
    next_oil_km = case when new.kind = 'oil' then coalesce(new.next_due_km, next_oil_km) else next_oil_km end,
    next_service_date = case when new.kind = 'maintenance' then coalesce(new.next_due_date, next_service_date) else next_service_date end,
    next_service_km = case when new.kind = 'maintenance' then coalesce(new.next_due_km, next_service_km) else next_service_km end,
    license_expiry = case when new.kind = 'license' then coalesce(new.next_due_date, license_expiry) else license_expiry end,
    insurance_expiry = case when new.kind = 'insurance' then coalesce(new.next_due_date, insurance_expiry) else insurance_expiry end
  where id = new.vehicle_id;
  return new;
end $$;
drop trigger if exists trg_vehicle_log on vehicle_logs;
create trigger trg_vehicle_log after insert on vehicle_logs for each row execute function vehicle_log_sync();

-- ═══════════════════════════ العروض (Views) ═══════════════════════════
-- رصيد كل صنف في كل مخزن وكل تشغيلة
create or replace view v_stock_balance with (security_invoker = true) as
select m.item_id, m.warehouse_id, m.batch_no, sum(m.qty) as qty,
       sum(m.qty) * coalesce(i.avg_cost, 0) as value, max(m.move_date) as last_move
from stock_moves m join items i on i.id = m.item_id
group by m.item_id, m.warehouse_id, m.batch_no, i.avg_cost
having abs(sum(m.qty)) > 0.000001;

-- رصيد كل صنف إجمالي
create or replace view v_item_stock with (security_invoker = true) as
select i.id as item_id, i.code, i.name, i.kind, i.unit, i.reorder_level, i.avg_cost, i.sale_price, i.material_type_id,
       coalesce(sum(m.qty), 0) as qty,
       coalesce(sum(m.qty), 0) * coalesce(i.avg_cost, 0) as value,
       coalesce(sum(m.qty) filter (where m.qty > 0), 0) as total_in,
       coalesce(-sum(m.qty) filter (where m.qty < 0), 0) as total_out,
       (coalesce(sum(m.qty), 0) <= coalesce(i.reorder_level, 0) and coalesce(i.reorder_level, 0) > 0) as is_low,
       max(m.move_date) as last_move
from items i left join stock_moves m on m.item_id = i.id
where i.active
group by i.id;

-- كشف حساب العملاء والموردين (موجب = عليه لينا)
create or replace view v_party_ledger with (security_invoker = true) as
select p.id as party_id, null::date as entry_date, 'opening' as doc_type, null::uuid as doc_id, null::text as doc_no,
       'رصيد أول المدة' as description,
       greatest(coalesce(p.opening_balance,0), 0) as debit, greatest(-coalesce(p.opening_balance,0), 0) as credit
from parties p where coalesce(p.opening_balance, 0) <> 0
union all
select customer_id, inv_date, 'sales_invoices', id, no, 'فاتورة مبيعات', total, 0 from sales_invoices where status = 'approved'
union all
select buyer_id, sale_date, 'scrap_sales', id, no, 'بيع خردة', total, 0 from scrap_sales where status = 'approved'
union all
select supplier_id, inv_date, 'supplier_invoices', id, no, 'فاتورة مشتريات' || coalesce(' رقم ' || supplier_ref, ''), 0, total from supplier_invoices where status = 'approved'
union all
select party_id, tx_date, 'cash_transactions', id, no, coalesce(description, case kind when 'receipt' then 'تحصيل' else 'سداد' end),
       case when kind = 'payment' then amount else 0 end, case when kind = 'receipt' then amount else 0 end
from cash_transactions where status = 'approved' and party_id is not null and kind in ('receipt','payment');

create or replace view v_party_balances with (security_invoker = true) as
select p.id as party_id, p.code, p.name, p.kind, p.phone, p.credit_limit,
       coalesce(sum(l.debit), 0) as total_debit, coalesce(sum(l.credit), 0) as total_credit,
       coalesce(sum(l.debit - l.credit), 0) as balance, max(l.entry_date) as last_date
from parties p left join v_party_ledger l on l.party_id = p.id
group by p.id;

-- حركة الخزائن
create or replace view v_cash_ledger with (security_invoker = true) as
select c.id as cashbox_id, null::date as entry_date, 'opening' as doc_type, null::uuid as doc_id, null::text as doc_no,
       'رصيد أول المدة' as description, greatest(coalesce(c.opening_balance,0),0) as amount_in, greatest(-coalesce(c.opening_balance,0),0) as amount_out
from cashboxes c where coalesce(c.opening_balance, 0) <> 0
union all
select cashbox_id, tx_date, 'cash_transactions', id, no,
       coalesce(description, case kind when 'receipt' then 'قبض' when 'payment' then 'صرف' else 'تحويل لخزينة' end),
       case when kind = 'receipt' then amount else 0 end, case when kind in ('payment','transfer') then amount else 0 end
from cash_transactions where status = 'approved'
union all
select to_cashbox_id, tx_date, 'cash_transactions', id, no, coalesce(description, 'تحويل وارد'), amount, 0
from cash_transactions where status = 'approved' and kind = 'transfer' and to_cashbox_id is not null
union all
select cashbox_id, exp_date, 'expenses', id, no, category || coalesce(' — ' || description, ''), 0, amount
from expenses where status = 'approved' and cashbox_id is not null
union all
select cashbox_id, tx_date, 'driver_transactions', id, null, case kind when 'advance' then 'سلفة سائق' else 'راتب سائق' end, 0, amount
from driver_transactions where cashbox_id is not null and kind in ('advance','salary')
union all
select cashbox_id, trip_date, 'trips', id, no, 'سلفة رحلة', 0, advance
from trips where status = 'approved' and cashbox_id is not null and coalesce(advance,0) > 0
union all
select cashbox_id, tx_date, 'employee_transactions', id, null, case kind when 'advance' then 'سلفة موظف' else 'صرف مرتب' end, 0, amount
from employee_transactions where cashbox_id is not null and kind in ('advance','salary_payment');

create or replace view v_cash_balances with (security_invoker = true) as
select c.id as cashbox_id, c.name, c.kind, coalesce(sum(l.amount_in), 0) as total_in, coalesce(sum(l.amount_out), 0) as total_out,
       coalesce(sum(l.amount_in - l.amount_out), 0) as balance
from cashboxes c left join v_cash_ledger l on l.cashbox_id = c.id
group by c.id;

-- حساب السائقين: إجمالي الرحلات − السلف − المصروفات − الخصومات = صافي المستحق
create or replace view v_driver_ledger with (security_invoker = true) as
select d.id as driver_id, null::date as entry_date, 'opening' as doc_type, null::uuid as doc_id, null::text as doc_no, 'رصيد أول المدة' as description,
       greatest(coalesce(d.opening_balance,0),0) as credit, greatest(-coalesce(d.opening_balance,0),0) as debit
from drivers d where coalesce(d.opening_balance,0) <> 0
union all
select driver_id, trip_date, 'trips', id, no, 'رحلة ' || coalesce(from_place,'') || ' ← ' || coalesce(to_place,''), fare, 0
from trips where status = 'approved'
union all
select driver_id, trip_date, 'trips', id, no, 'مصروفات رحلة (سولار ورسوم)', 0, coalesce(fuel,0) + coalesce(tolls,0) + coalesce(other_exp,0)
from trips where status = 'approved' and coalesce(fuel,0) + coalesce(tolls,0) + coalesce(other_exp,0) > 0
union all
select driver_id, trip_date, 'trips', id, no, 'سلفة رحلة', 0, advance
from trips where status = 'approved' and coalesce(advance,0) > 0
union all
select driver_id, tx_date, 'driver_transactions', id, null,
       case kind when 'advance' then 'سلفة' when 'deduction' then 'خصم' when 'bonus' then 'مكافأة' else 'راتب' end || coalesce(' — ' || notes, ''),
       case when kind in ('bonus','salary') then amount else 0 end, case when kind in ('advance','deduction') then amount else 0 end
from driver_transactions
union all
select driver_id, tx_date, 'cash_transactions', id, no, coalesce(description, 'صرف مستحقات'), 0, amount
from cash_transactions where status = 'approved' and party_type = 'driver' and driver_id is not null and kind = 'payment';

create or replace view v_driver_dues with (security_invoker = true) as
select d.id as driver_id, d.name, d.phone, d.vehicle_id,
       coalesce((select count(*) from trips t where t.driver_id = d.id and t.status = 'approved'), 0) as trips_count,
       coalesce((select sum(fare) from trips t where t.driver_id = d.id and t.status = 'approved'), 0) as trips_total,
       coalesce(sum(l.credit), 0) as total_credit, coalesce(sum(l.debit), 0) as total_debit,
       coalesce(sum(l.credit - l.debit), 0) as net_due
from drivers d left join v_driver_ledger l on l.driver_id = d.id
group by d.id;

-- تكلفة وربحية كل أمر تشغيل
create or replace view v_wo_cost with (security_invoker = true) as
select w.id as wo_id, w.no, w.status, w.customer_id, w.product_item_id, w.qty_required, w.due_date, w.start_date,
       coalesce(mi.issued_qty, 0) as issued_qty,
       coalesce(mi.material_cost, 0) as material_cost,
       coalesce(mp.produced_qty, 0) as produced_qty,
       coalesce(sc.scrap_qty, 0) as scrap_qty, coalesce(sc.scrap_value, 0) as scrap_value,
       coalesce(qc.rejected, 0) as rejected_qty,
       coalesce(ex.direct_exp, 0) as direct_expenses,
       coalesce(st.machine_hours_cost, 0) as stages_machine_cost,
       coalesce(st.labor_hours_cost, 0) as stages_labor_cost,
       coalesce(w.labor_cost,0) + coalesce(w.machine_cost,0) + coalesce(w.energy_cost,0) + coalesce(w.transport_cost,0) + coalesce(w.other_cost,0) as manual_costs,
       coalesce(mi.material_cost, 0) + coalesce(ex.direct_exp, 0) + coalesce(st.machine_hours_cost, 0) + coalesce(st.labor_hours_cost, 0)
         + coalesce(w.labor_cost,0) + coalesce(w.machine_cost,0) + coalesce(w.energy_cost,0) + coalesce(w.transport_cost,0) + coalesce(w.other_cost,0)
         - coalesce(sc.scrap_value, 0) as total_cost,
       coalesce(w.sale_price_total, 0) as sale_value,
       case when coalesce(mi.issued_qty,0) > 0 then round(coalesce(sc.scrap_qty,0) / mi.issued_qty * 100, 2) else 0 end as scrap_pct,
       (w.due_date < current_date and w.status not in ('completed','delivered','cancelled')) as is_late
from work_orders w
left join (select work_order_id, -sum(qty) as issued_qty, -sum(qty * unit_cost) as material_cost
           from stock_moves where qty < 0 and work_order_id is not null and doc_type = 'stock_docs' group by work_order_id) mi on mi.work_order_id = w.id
left join (select m.work_order_id, sum(m.qty) as produced_qty from stock_moves m join stock_docs s on s.id = m.doc_id
           where m.doc_type = 'stock_docs' and s.kind = 'production' group by m.work_order_id) mp on mp.work_order_id = w.id
left join (select wo_id, sum(weight) as scrap_qty, sum(est_value) as scrap_value from scrap_records where status = 'approved' group by wo_id) sc on sc.wo_id = w.id
left join (select wo_id, sum(qty_rejected) as rejected from qc_inspections where status = 'approved' group by wo_id) qc on qc.wo_id = w.id
left join (select wo_id, sum(amount) as direct_exp from expenses where status = 'approved' and wo_id is not null group by wo_id) ex on ex.wo_id = w.id
left join (select s.doc_id,
                  sum(extract(epoch from (s.ended_at - s.started_at)) / 3600 * coalesce(mc.hour_rate, 0)) as machine_hours_cost,
                  sum(extract(epoch from (s.ended_at - s.started_at)) / 3600 * coalesce(e.hour_rate, 0)) as labor_hours_cost
           from wo_stages s left join machines mc on mc.id = s.machine_id left join employees e on e.id = s.employee_id
           where s.started_at is not null and s.ended_at is not null group by s.doc_id) st on st.doc_id = w.id;

-- التنبيهات
create or replace view v_alerts with (security_invoker = true) as
select 'low_stock' as kind, 'warn' as level, 'رصيد منخفض: ' || name || ' (' || round(qty, 2) || ')' as title,
       'items' as ref_table, item_id as ref_id, null::date as due_date
from v_item_stock where is_low
union all
select 'late_wo', 'danger', 'أمر تشغيل متأخر: ' || no, 'work_orders', id, due_date
from work_orders where due_date < current_date and status not in ('completed','delivered','cancelled')
union all
select 'vehicle_license', case when license_expiry < current_date then 'danger' else 'warn' end, 'ترخيص سيارة ' || plate_no, 'vehicles', id, license_expiry
from vehicles where active and license_expiry <= current_date + 30
union all
select 'vehicle_insurance', case when insurance_expiry < current_date then 'danger' else 'warn' end, 'تأمين سيارة ' || plate_no, 'vehicles', id, insurance_expiry
from vehicles where active and insurance_expiry <= current_date + 30
union all
select 'vehicle_service', 'warn', 'صيانة سيارة ' || plate_no, 'vehicles', id, next_service_date
from vehicles where active and next_service_date <= current_date + 7
union all
select 'vehicle_oil', 'warn', 'تغيير زيت ' || plate_no, 'vehicles', id, next_oil_date
from vehicles where active and (next_oil_date <= current_date + 7 or (next_oil_km is not null and odometer >= next_oil_km - 300))
union all
select 'driver_license', case when license_expiry < current_date then 'danger' else 'warn' end, 'رخصة السائق ' || name, 'drivers', id, license_expiry
from drivers where active and license_expiry <= current_date + 30
union all
select 'machine_maintenance', case when next_maintenance_date < current_date then 'danger' else 'warn' end, 'صيانة ماكينة ' || name, 'machines', id, next_maintenance_date
from machines where active and next_maintenance_date <= current_date + 7
union all
select 'invoice_due', 'danger', 'فاتورة متأخرة: ' || no, 'sales_invoices', id, due_date
from sales_invoices where status = 'approved' and due_date < current_date
  and customer_id in (select party_id from v_party_balances where balance > 0)
union all
select 'cheque_due', 'warn', 'شيك مستحق: ' || coalesce(reference, no), 'cash_transactions', id, cheque_due
from cash_transactions where method = 'cheque' and status <> 'cancelled' and cheque_due between current_date - 3 and current_date + 7;

-- ═══════════════════════════ الصلاحيات (RLS) ═══════════════════════════
do $$
declare t text; m text;
begin
  for t, m in select * from (values
    ('material_types','material_types'),('warehouses','warehouses'),('parties','parties'),('items','items'),
    ('stock_moves','stock'),('stock_docs','stock'),('stock_doc_lines','stock'),
    ('gate_in','gate_in'),('gate_in_lines','gate_in'),('gate_out','gate_out'),('gate_out_lines','gate_out'),
    ('machines','machines'),('machine_logs','machines'),('employees','employees'),('attendance','employees'),('employee_transactions','employees'),
    ('process_stages','work_orders'),('work_orders','work_orders'),('wo_stages','work_orders'),
    ('qc_inspections','quality'),('scrap_records','scrap'),('scrap_sales','scrap'),('scrap_sale_lines','scrap'),
    ('purchase_requests','purchasing'),('pr_lines','purchasing'),('purchase_orders','purchasing'),('po_lines','purchasing'),
    ('supplier_invoices','purchasing'),('sinv_lines','purchasing'),
    ('quotations','sales'),('quotation_lines','sales'),('sales_orders','sales'),('so_lines','sales'),('sales_invoices','sales'),('si_lines','sales'),
    ('cashboxes','treasury'),('cash_transactions','treasury'),('expense_categories','expenses'),('expenses','expenses'),
    ('vehicles','vehicles'),('vehicle_logs','vehicles'),('drivers','drivers'),('trips','drivers'),('driver_transactions','drivers')
  ) v(a,b)
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
    -- القراءة: أي مستخدم فعّال يقدر يقرا البيانات الأساسية عشان القوائم المنسدلة، والباقي حسب الصلاحية
    if t in ('material_types','warehouses','items','process_stages','expense_categories','machines','cashboxes','vehicles','drivers','employees','parties') then
      execute format('create policy p_sel on %I for select using (is_member())', t);
    else
      execute format('create policy p_sel on %I for select using (can(%L, ''view'') or can(''reports'', ''view''))', t, m);
    end if;
    execute format('create policy p_ins on %I for insert with check (can(%L, ''create''))', t, m);
    execute format('create policy p_upd on %I for update using (can(%L, ''edit'')) with check (can(%L, ''edit''))', t, m, m);
    execute format('create policy p_del on %I for delete using (can(%L, ''delete''))', t, m);
  end loop;
end $$;

-- الحركات بتتكتب من دوال الاعتماد بس
drop policy if exists p_ins on stock_moves;
drop policy if exists p_upd on stock_moves;
drop policy if exists p_del on stock_moves;

alter table settings enable row level security;
drop policy if exists p_sel on settings; drop policy if exists p_all on settings;
create policy p_sel on settings for select using (is_member());
create policy p_all on settings for all using (can('settings','edit')) with check (can('settings','edit'));

alter table roles enable row level security;
drop policy if exists p_sel on roles; drop policy if exists p_all on roles;
create policy p_sel on roles for select using (is_member());
create policy p_all on roles for all using (is_admin()) with check (is_admin());

alter table role_perms enable row level security;
drop policy if exists p_sel on role_perms; drop policy if exists p_all on role_perms;
create policy p_sel on role_perms for select using (is_member());
create policy p_all on role_perms for all using (is_admin()) with check (is_admin());

alter table profiles enable row level security;
drop policy if exists p_self on profiles; drop policy if exists p_admin on profiles;
create policy p_self on profiles for select using (id = auth.uid() or is_admin() or can('users','view'));
create policy p_admin on profiles for all using (is_admin()) with check (is_admin());

alter table audit_log enable row level security;
drop policy if exists p_sel on audit_log;
create policy p_sel on audit_log for select using (can('audit','view'));

alter table doc_counters enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function approve_doc(text, uuid) to authenticated;
grant execute on function unapprove_doc(text, uuid, boolean) to authenticated;
revoke all on all tables in schema public from anon;

-- ═══════════════════════════ التخزين (الصور والمرفقات) ═══════════════════════════
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
drop policy if exists "erp files read" on storage.objects;
drop policy if exists "erp files write" on storage.objects;
drop policy if exists "erp files delete" on storage.objects;
create policy "erp files read" on storage.objects for select using (bucket_id = 'files' and public.is_member());
create policy "erp files write" on storage.objects for insert with check (bucket_id = 'files' and public.is_member());
create policy "erp files delete" on storage.objects for delete using (bucket_id = 'files' and public.is_admin());

-- ═══════════════════════════ البيانات المبدئية ═══════════════════════════
insert into roles (key, name, sort) values
  ('admin','مدير النظام',1),('manager','الإدارة',2),('accounts','الحسابات',3),('stores','المخازن',4),
  ('purchasing','المشتريات',5),('sales','المبيعات',6),('production','الإنتاج',7),('quality','الجودة',8),
  ('gate','الأمن والبوابة',9),('drivers','السائقون والنقل',10),('none','بدون صلاحية',99)
on conflict (key) do nothing;

-- v=عرض c=إضافة e=تعديل d=حذف a=اعتماد
do $$
declare r record;
begin
  for r in select * from (values
    ('manager','dashboard','v'),('manager','reports','v'),('manager','costing','v'),('manager','audit','v'),
    ('manager','items','v'),('manager','material_types','v'),('manager','warehouses','v'),('manager','stock','va'),('manager','gate_in','va'),('manager','gate_out','va'),
    ('manager','work_orders','va'),('manager','quality','va'),('manager','scrap','va'),('manager','purchasing','va'),('manager','sales','va'),
    ('manager','parties','v'),('manager','treasury','va'),('manager','expenses','va'),('manager','drivers','va'),('manager','vehicles','v'),
    ('manager','employees','v'),('manager','machines','v'),
    ('accounts','dashboard','v'),('accounts','reports','v'),('accounts','costing','v'),('accounts','parties','vced'),('accounts','treasury','vceda'),
    ('accounts','expenses','vceda'),('accounts','sales','vcea'),('accounts','purchasing','vcea'),('accounts','drivers','vcea'),('accounts','employees','vce'),
    ('accounts','items','v'),('accounts','stock','v'),
    ('stores','dashboard','v'),('stores','items','vce'),('stores','material_types','vce'),('stores','warehouses','vce'),('stores','stock','vcea'),
    ('stores','gate_in','vcea'),('stores','gate_out','vcea'),('stores','scrap','vcea'),('stores','reports','v'),
    ('purchasing','dashboard','v'),('purchasing','purchasing','vcea'),('purchasing','parties','vce'),('purchasing','items','vc'),('purchasing','stock','v'),('purchasing','gate_in','v'),
    ('sales','dashboard','v'),('sales','sales','vcea'),('sales','parties','vce'),('sales','items','v'),('sales','stock','v'),('sales','gate_out','v'),('sales','work_orders','v'),
    ('production','dashboard','v'),('production','work_orders','vcea'),('production','stock','vc'),('production','machines','vce'),('production','scrap','vc'),
    ('production','quality','v'),('production','items','v'),('production','employees','v'),
    ('quality','dashboard','v'),('quality','quality','vcea'),('quality','work_orders','v'),('quality','scrap','vc'),
    ('gate','gate_in','vc'),('gate','gate_out','vc'),('gate','vehicles','v'),('gate','drivers','v'),
    ('drivers','drivers','vc'),('drivers','vehicles','vce')
  ) v(role, module, acts)
  loop
    insert into role_perms (role, module, can_view, can_create, can_edit, can_delete, can_approve)
    values (r.role, r.module, r.acts like '%v%', r.acts like '%c%', r.acts like '%e%', r.acts like '%d%', r.acts like '%a%')
    on conflict (role, module) do nothing;
  end loop;
end $$;

insert into settings (key, value) values
  ('company', '{"name":"Star Metal","address":"","phone":"","tax_no":"","logo_url":"","currency":"ج.م"}'),
  ('stock', '{"allow_negative": false}')
on conflict (key) do nothing;

insert into material_types (name, family, grade, standard, density, forms, notes)
select * from (values
  ('حديد كربوني عادي ST37', 'حديد كربوني', 'ST37 / S235', 'DIN EN 10025', 7850, 'صاج، ألواح، قطاعات، زوايا، مبسط، كمرات', 'أشهر حديد للتشغيل العام والهياكل'),
  ('حديد عالي المقاومة ST52', 'حديد كربوني', 'ST52 / S355', 'DIN EN 10025', 7850, 'صاج، ألواح، كمرات', 'للهياكل اللي عليها أحمال عالية'),
  ('صاج أسود مدرفل على الساخن', 'حديد كربوني', 'HRC', 'ASTM A36', 7850, 'لفائف، ألواح', null),
  ('صاج مدرفل على البارد', 'حديد كربوني', 'CRC / DC01', 'EN 10130', 7850, 'لفائف، ألواح', 'سطح ناعم للثني والدهان'),
  ('صاج مجلفن', 'حديد مجلفن', 'DX51D + Z', 'EN 10346', 7850, 'لفائف، ألواح، صاج مضلع', 'مقاوم للصدأ بطبقة زنك'),
  ('مواسير حديد', 'حديد كربوني', 'ST37', 'DIN 2440', 7850, 'مواسير مستديرة، مربعة، مستطيلة', null),
  ('حديد تسليح', 'حديد كربوني', 'B500 / 52', 'ES 262', 7850, 'أسياخ', null),
  ('ستانلس ستيل 304', 'ستانلس ستيل', 'SS304', 'ASTM A240', 8000, 'صاج، ألواح، مواسير، قضبان', 'أكتر نوع ستانلس استخدامًا'),
  ('ستانلس ستيل 316', 'ستانلس ستيل', 'SS316', 'ASTM A240', 8000, 'صاج، ألواح، مواسير', 'مقاوم للكيماويات والمية المالحة'),
  ('ستانلس ستيل 430', 'ستانلس ستيل', 'SS430', 'ASTM A240', 7700, 'صاج، ألواح', 'مغناطيسي وأرخص'),
  ('ألومنيوم 1050', 'ألومنيوم', 'AA1050', 'EN 573', 2710, 'صاج، لفائف', 'نقي وسهل التشكيل'),
  ('ألومنيوم 5052', 'ألومنيوم', 'AA5052', 'EN 573', 2680, 'صاج، ألواح', 'مقاوم للتآكل'),
  ('ألومنيوم 6061', 'ألومنيوم', 'AA6061-T6', 'EN 573', 2700, 'قضبان، قطاعات، ألواح', 'للخراطة والتفريز'),
  ('نحاس أحمر', 'نحاس', 'Cu-ETP / C11000', 'ASTM B152', 8960, 'صاج، قضبان، مواسير، سلك', null),
  ('نحاس أصفر (براص)', 'نحاس', 'CuZn37 / C27200', 'EN 12163', 8500, 'قضبان، صاج', 'للخراطة الدقيقة'),
  ('حديد زهر', 'حديد زهر', 'GG25', 'EN 1561', 7200, 'مسبوكات، بلوكات', null),
  ('حديد عدة', 'حديد سبائكي', 'D2 / 1.2379', 'DIN', 7700, 'قضبان، بلوكات', 'للاسطمبات والعِدد'),
  ('زنك', 'معادن أخرى', 'Zn', null, 7140, 'ألواح، سبائك', null),
  ('رصاص', 'معادن أخرى', 'Pb', null, 11340, 'ألواح، سبائك', null)
) v(name, family, grade, standard, density, forms, notes)
where not exists (select 1 from material_types);

insert into warehouses (code, name, kind)
select * from (values ('W-RAW','مخزن الخامات','raw'),('W-WIP','مخزن تحت التشغيل','wip'),('W-FIN','مخزن المنتج النهائي','finished'),
                      ('W-SCR','مخزن الخردة والهالك','scrap'),('W-SPR','مخزن قطع الغيار','spares')) v(a,b,c)
where not exists (select 1 from warehouses);

insert into process_stages (name, sort)
select * from (values ('قص',1),('تقطيع',2),('ثني',3),('تخريم',4),('خراطة',5),('تفريز',6),('لحام',7),('تجميع',8),
                      ('معالجة',9),('دهان',10),('تشطيب',11),('فحص جودة',12),('تعبئة',13)) v(a,b)
where not exists (select 1 from process_stages);

insert into expense_categories (name, kind, sort) values
  ('كهرباء','operating',1),('غاز','operating',2),('مياه','operating',3),('وقود','operating',4),('نقل','operating',5),
  ('صيانة','operating',6),('قطع غيار','operating',7),('أجور','operating',8),('إيجار','admin',9),('مصروفات إدارية','admin',10),
  ('مصروفات تشغيل','operating',11),('مصروفات سيارات','vehicles',12),('أخرى','other',13)
on conflict (name) do nothing;

insert into cashboxes (name, kind)
select 'الخزينة الرئيسية', 'cash' where not exists (select 1 from cashboxes);

-- ✅ خلاص. أول حساب هيتسجل في السيستم هيبقى «مدير النظام» تلقائيًا.
