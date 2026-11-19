// تعريف كل أقسام السيستم: الجدول، الحقول، الأصناف، والصلاحية
// type: text | textarea | number | money | date | datetime | time | select | ref | check | image | files
import { today } from '../lib/format'

const F = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra })
const now = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)

const itemLine = (extra = []) => [F('item_id', 'الصنف', 'ref', { ref: 'items', required: true, w: 3 }), ...extra]
const pricedLines = (table) => ({
  table, title: 'الأصناف', priced: true,
  fields: [F('item_id', 'الصنف', 'ref', { ref: 'items', w: 3, fillPrice: true }), F('description', 'البيان', 'text', { w: 2 }), F('qty', 'الكمية', 'number', { required: true }), F('price', 'السعر', 'money'), F('_total', 'الإجمالي', 'calc', { calc: (l) => (Number(l.qty) || 0) * (Number(l.price) || 0), money: true })],
})
const totalsFields = [
  F('discount', 'خصم', 'money', { group: 'totals' }), F('transport_cost', 'مصاريف نقل', 'money', { group: 'totals' }),
  F('tax_rate', 'نسبة الضريبة %', 'number', { group: 'totals', default: 14 }),
  F('subtotal', 'الإجمالي قبل الضريبة', 'money', { readonly: true, list: false, group: 'totals' }),
  F('tax_amount', 'الضريبة', 'money', { readonly: true, group: 'totals' }),
  F('total', 'الإجمالي النهائي', 'money', { readonly: true, list: true, group: 'totals' }),
]

export const MODULES = {
  // ═════════ البيانات الأساسية ═════════
  material_types: {
    table: 'material_types', perm: 'material_types', title: 'أنواع الخامات', single: 'نوع خامة', icon: 'layers', order: 'name', asc: true,
    intro: 'كل معدن بيتعامل معاه المصنع بدرجته وكثافته — الكثافة بتستخدم في حساب وزن الأصناف أوتوماتيك',
    fields: [
      F('name', 'اسم الخامة', 'text', { required: true, list: true, search: true, w: 2 }),
      F('family', 'العائلة', 'text', { list: true, search: true, suggest: ['حديد كربوني', 'حديد مجلفن', 'ستانلس ستيل', 'ألومنيوم', 'نحاس', 'حديد زهر', 'حديد سبائكي', 'معادن أخرى'], filter: true }),
      F('grade', 'الدرجة / الرتبة', 'text', { list: true, search: true }),
      F('standard', 'المواصفة القياسية', 'text', { list: true }),
      F('density', 'الكثافة (كجم/م³)', 'number', { list: true, default: 7850 }),
      F('price_per_ton', 'سعر الطن الاسترشادي', 'money', { list: true }),
      F('forms', 'الأشكال المتاحة', 'text', { w: 2 }),
      F('color', 'لون مميز في التقارير', 'color'),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }),
      F('active', 'نشط', 'check', { default: true, list: true }),
    ],
  },
  items: {
    table: 'items', perm: 'items', title: 'الأصناف والخامات', single: 'صنف', icon: 'box', order: 'code', asc: true, detail: 'item',
    fields: [
      F('code', 'كود الصنف', 'text', { required: true, list: true, search: true }),
      F('name', 'اسم الصنف', 'text', { required: true, list: true, search: true, w: 2 }),
      F('kind', 'نوع الصنف', 'select', { options: 'item_kind', default: 'raw', list: true, filter: true }),
      F('material_type_id', 'نوع المعدن / الخامة', 'ref', { ref: 'material_types', list: true, filter: true }),
      F('form', 'الشكل', 'select', { options: 'forms' }),
      F('grade', 'الدرجة', 'text'),
      F('size', 'المقاس', 'text', { list: true }),
      F('thickness', 'السمك (مم)', 'number', { group: 'dims' }),
      F('length', 'الطول (مم)', 'number', { group: 'dims' }),
      F('width', 'العرض (مم)', 'number', { group: 'dims' }),
      F('diameter', 'القطر (مم)', 'number', { group: 'dims' }),
      F('weight_per_unit', 'وزن الوحدة (كجم)', 'number', { group: 'dims', autoWeight: true }),
      F('unit', 'الوحدة', 'select', { options: 'unit', default: 'kg', list: true }),
      F('supplier_id', 'المورد الأساسي', 'ref', { ref: 'parties' }),
      F('avg_cost', 'متوسط التكلفة', 'money', { list: true, readonly: true, help: 'بيتحسب أوتوماتيك من الاستلامات' }),
      F('sale_price', 'سعر البيع', 'money', { list: true }),
      F('reorder_level', 'حد إعادة الطلب', 'number'),
      F('barcode', 'الباركود', 'text', { search: true, help: 'لو سبته فاضي هيبقى نفس الكود' }),
      F('location', 'المكان في المخزن', 'text'),
      F('image_url', 'صورة الصنف', 'image'),
      F('attachments', 'مرفقات', 'files'),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }),
      F('active', 'نشط', 'check', { default: true }),
    ],
  },
  warehouses: {
    table: 'warehouses', perm: 'warehouses', title: 'المخازن', single: 'مخزن', icon: 'warehouse', order: 'name', asc: true,
    fields: [F('code', 'الكود', 'text', { list: true }), F('name', 'اسم المخزن', 'text', { required: true, list: true, search: true, w: 2 }),
      F('kind', 'نوع المخزن', 'select', { options: 'wh_kind', list: true }), F('location', 'المكان', 'text', { list: true }),
      F('keeper', 'أمين المخزن', 'text', { list: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'نشط', 'check', { default: true })],
  },
  customers: {
    table: 'parties', perm: 'parties', title: 'العملاء', single: 'عميل', icon: 'users', order: 'name', asc: true, detail: 'party',
    fixed: [['kind', 'in', ['customer', 'both', 'scrap_buyer']]], defaults: { kind: 'customer' },
    fields: partyFields(),
  },
  suppliers: {
    table: 'parties', perm: 'parties', title: 'الموردين', single: 'مورد', icon: 'truck-in', order: 'name', asc: true, detail: 'party',
    fixed: [['kind', 'in', ['supplier', 'both']]], defaults: { kind: 'supplier' },
    fields: partyFields(),
  },

  // ═════════ المخازن ═════════
  stock_docs: {
    table: 'stock_docs', perm: 'stock', title: 'أذون المخزن', single: 'إذن مخزن', icon: 'clipboard', approvable: true, dateField: 'doc_date', printable: true,
    tabs: { field: 'kind', options: 'stock_kind' },
    fields: [
      F('no', 'رقم الإذن', 'text', { readonly: true, list: true, search: true }),
      F('kind', 'نوع الإذن', 'select', { options: 'stock_kind', required: true, list: true }),
      F('doc_date', 'التاريخ', 'date', { default: today, list: true }),
      F('warehouse_id', 'المخزن', 'ref', { ref: 'warehouses', required: true, list: true, labelBy: (r) => (r.kind === 'transfer' ? 'من مخزن' : r.kind === 'production' ? 'المخزن المستلم' : 'المخزن') }),
      F('to_warehouse_id', 'إلى مخزن', 'ref', { ref: 'warehouses', show: (r) => r.kind === 'transfer' }),
      F('work_order_id', 'أمر التشغيل', 'ref', { ref: 'work_orders', show: (r) => ['issue', 'production', 'return'].includes(r.kind), list: true, required: (r) => r.kind === 'production' }),
      F('party_id', 'الجهة', 'ref', { ref: 'parties', show: (r) => ['add', 'return'].includes(r.kind) }),
      F('reason', 'السبب', 'text', { w: 2, list: true }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }),
      F('attachments', 'مرفقات', 'files'),
    ],
    lines: {
      table: 'stock_doc_lines', title: 'الأصناف',
      fields: itemLine([F('batch_no', 'رقم التشغيلة', 'batch'), F('qty', 'الكمية', 'number', { show: (d) => d.kind !== 'count', help: (d) => (d.kind === 'adjust' ? 'بالسالب للنقص' : '') }),
        F('counted_qty', 'الكمية الفعلية (الجرد)', 'number', { show: (d) => d.kind === 'count' }), F('_sys', 'رصيد السيستم', 'stockcalc', { show: (d) => d.kind === 'count' || d.kind === 'issue' || d.kind === 'transfer' }),
        F('unit_cost', 'تكلفة الوحدة', 'money', { show: (d) => ['add', 'return', 'adjust'].includes(d.kind) }), F('location', 'المكان', 'text')]),
    },
  },

  // ═════════ البوابة ═════════
  gate_in: {
    table: 'gate_in', perm: 'gate_in', title: 'حركة الداخل للمصنع', single: 'إذن دخول', icon: 'truck-in', approvable: true, dateField: 'entry_at', printable: true,
    intro: 'كل سيارة خامات بتدخل المصنع — بعد الاعتماد الكميات بتدخل المخزن أوتوماتيك',
    fields: [
      F('no', 'رقم إذن الدخول', 'text', { readonly: true, list: true, search: true }),
      F('entry_at', 'التاريخ والوقت', 'datetime', { default: now, list: true }),
      F('supplier_id', 'المورد', 'ref', { ref: 'parties', list: true, filter: true }),
      F('po_id', 'أمر الشراء', 'ref', { ref: 'purchase_orders', help: 'لو مربوط بأمر شراء هيتحدث المستلم منه' }),
      F('vehicle_no', 'رقم السيارة', 'text', { list: true, search: true }), F('driver_name', 'اسم السائق', 'text', { list: true }), F('driver_phone', 'تليفون السائق', 'text'),
      F('material_desc', 'نوع الخام', 'text', { w: 2 }),
      F('gross_weight', 'الوزن الإجمالي (كجم)', 'number', { group: 'weights' }), F('tare_weight', 'وزن السيارة فارغ (كجم)', 'number', { group: 'weights' }),
      F('net_weight', 'صافي الوزن (كجم)', 'number', { readonly: true, list: true, group: 'weights', calc: (r) => (Number(r.gross_weight) || 0) - (Number(r.tare_weight) || 0) }),
      F('warehouse_id', 'المخزن المستلم', 'ref', { ref: 'warehouses', required: true }),
      F('receiver_name', 'الموظف المستلم', 'text'),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'صور ومستندات', 'files'),
    ],
    lines: { table: 'gate_in_lines', title: 'الخامات المستلمة', fields: itemLine([F('qty', 'الكمية', 'number', { required: true }), F('weight', 'الوزن (كجم)', 'number'), F('unit_cost', 'سعر الوحدة', 'money', { fillCost: true }), F('batch_no', 'رقم التشغيلة', 'text', { help: 'لو فاضي بيتعمل أوتوماتيك' })]) },
  },
  gate_out: {
    table: 'gate_out', perm: 'gate_out', title: 'حركة الخارج من المصنع', single: 'إذن خروج', icon: 'truck-out', approvable: true, dateField: 'exit_at', printable: true,
    intro: 'كل منتج أو خامة خارجة — بعد الاعتماد الكميات بتتخصم من المخزن أوتوماتيك',
    fields: [
      F('no', 'رقم إذن الخروج', 'text', { readonly: true, list: true, search: true }),
      F('exit_at', 'وقت الخروج', 'datetime', { default: now, list: true }),
      F('customer_id', 'العميل', 'ref', { ref: 'parties', list: true, filter: true }),
      F('sales_order_id', 'أمر البيع', 'ref', { ref: 'sales_orders' }), F('invoice_id', 'رقم الفاتورة', 'ref', { ref: 'sales_invoices' }),
      F('warehouse_id', 'من مخزن', 'ref', { ref: 'warehouses', required: true }),
      F('vehicle_id', 'السيارة', 'ref', { ref: 'vehicles', fills: { driver_id: 'driver_id' } }), F('vehicle_no', 'رقم السيارة (لو خارجية)', 'text', { list: true }),
      F('driver_id', 'السائق', 'ref', { ref: 'drivers' }), F('driver_name', 'اسم السائق (لو خارجي)', 'text', { list: true }),
      F('loading_info', 'بيانات التحميل', 'text', { w: 2 }), F('delivered_by', 'مسؤول التسليم', 'text'),
      F('collection_status', 'حالة التحصيل', 'select', { options: 'collection', list: true, editableApproved: true }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'مرفقات', 'files'),
    ],
    lines: { table: 'gate_out_lines', title: 'الأصناف الخارجة', fields: itemLine([F('batch_no', 'رقم التشغيلة', 'batch'), F('_sys', 'المتاح', 'stockcalc'), F('qty', 'الكمية', 'number', { required: true }), F('weight', 'الوزن (كجم)', 'number')]) },
  },

  // ═════════ الإنتاج ═════════
  work_orders: {
    table: 'work_orders', perm: 'work_orders', title: 'أوامر التشغيل', single: 'أمر تشغيل', icon: 'gear', statusOpt: 'wo_status', dateField: 'start_date', printable: true, detail: 'wo',
    fields: [
      F('no', 'رقم أمر التشغيل', 'text', { readonly: true, list: true, search: true }),
      F('customer_id', 'العميل', 'ref', { ref: 'parties', list: true, filter: true }), F('project', 'المشروع', 'text', { list: true, search: true }),
      F('product_item_id', 'المنتج المطلوب', 'ref', { ref: 'items', list: true, w: 2 }), F('qty_required', 'الكمية المطلوبة', 'number', { list: true }),
      F('raw_item_id', 'نوع الخام', 'ref', { ref: 'items', w: 2 }), F('raw_qty_required', 'كمية الخام المطلوبة', 'number'),
      F('start_date', 'تاريخ البداية', 'date', { default: today, list: true }), F('due_date', 'تاريخ التسليم المتوقع', 'date', { list: true }),
      F('machine_id', 'الماكينة', 'ref', { ref: 'machines' }), F('responsible', 'المسؤول / الفنيين', 'text'),
      F('priority', 'الأولوية', 'select', { options: 'priority', default: 'normal', list: true }),
      F('status', 'الحالة', 'select', { options: 'wo_status', default: 'new', list: true, filter: true }),
      F('labor_cost', 'تكلفة العمالة', 'money', { group: 'costs' }), F('machine_cost', 'تشغيل الماكينات', 'money', { group: 'costs' }),
      F('energy_cost', 'الكهرباء والطاقة', 'money', { group: 'costs' }), F('transport_cost', 'النقل', 'money', { group: 'costs' }),
      F('other_cost', 'تكاليف إضافية', 'money', { group: 'costs' }), F('sale_price_total', 'إجمالي سعر البيع', 'money', { group: 'costs', list: true }),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'رسومات ومرفقات', 'files'),
    ],
    lines: {
      table: 'wo_stages', title: 'مراحل التشغيل', optional: true,
      fields: [F('stage_id', 'المرحلة', 'ref', { ref: 'process_stages', w: 2 }), F('machine_id', 'الماكينة', 'ref', { ref: 'machines' }), F('employee_id', 'العامل / الفني', 'ref', { ref: 'employees' }),
        F('started_at', 'البداية', 'datetime'), F('ended_at', 'النهاية', 'datetime'), F('_hours', 'الزمن (ساعة)', 'calc', { calc: (l) => (l.started_at && l.ended_at ? Math.max(0, (new Date(l.ended_at) - new Date(l.started_at)) / 36e5) : 0) }),
        F('qty_done', 'الكمية المنجزة', 'number'), F('status', 'الحالة', 'select', { options: 'stage_status', default: 'pending' })],
    },
  },
  process_stages: {
    table: 'process_stages', perm: 'work_orders', title: 'مراحل التشغيل', single: 'مرحلة', icon: 'steps', order: 'sort', asc: true,
    fields: [F('name', 'اسم المرحلة', 'text', { required: true, list: true, w: 2 }), F('sort', 'الترتيب', 'number', { list: true }), F('notes', 'ملاحظات', 'text', { list: true, w: 2 }), F('active', 'نشطة', 'check', { default: true, list: true })],
  },
  qc_inspections: {
    table: 'qc_inspections', perm: 'quality', title: 'الجودة', single: 'فحص جودة', icon: 'check', approvable: true, dateField: 'insp_date', printable: true,
    fields: [
      F('no', 'رقم الفحص', 'text', { readonly: true, list: true, search: true }), F('insp_date', 'التاريخ', 'date', { default: today, list: true }),
      F('wo_id', 'أمر التشغيل', 'ref', { ref: 'work_orders', list: true }), F('item_id', 'الصنف', 'ref', { ref: 'items', list: true, w: 2 }),
      F('spec', 'المواصفات المطلوبة', 'textarea', { w: 3 }),
      F('qty_inspected', 'الكمية المفحوصة', 'number', { list: true }), F('qty_accepted', 'المقبول', 'number', { list: true }), F('qty_rejected', 'المرفوض', 'number', { list: true }),
      F('reject_reason', 'سبب الرفض', 'text', { w: 2 }), F('decision', 'القرار', 'select', { options: 'qc_decision', list: true }),
      F('inspector', 'القائم بالفحص', 'text'), F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'صور الفحص', 'files'),
    ],
  },
  scrap_records: {
    table: 'scrap_records', perm: 'scrap', title: 'الهالك والخردة', single: 'تسجيل هالك', icon: 'recycle', approvable: true, dateField: 'rec_date',
    intro: 'بعد الاعتماد وزن الخردة بيدخل مخزن الخردة، وبيتحسب في نسبة هالك أمر التشغيل',
    fields: [
      F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('rec_date', 'التاريخ', 'date', { default: today, list: true }),
      F('scrap_type', 'نوع الخردة', 'text', { list: true, suggest: ['بواقي صاج', 'رايش خراطة', 'بواقي مواسير', 'قطع مرفوضة', 'تالف'] }),
      F('source', 'المصدر', 'select', { options: 'scrap_source', list: true, filter: true }),
      F('wo_id', 'أمر التشغيل', 'ref', { ref: 'work_orders', list: true }), F('machine_id', 'الماكينة', 'ref', { ref: 'machines' }),
      F('item_id', 'صنف الخردة', 'ref', { ref: 'items', refFilter: (i) => i.kind === 'scrap', required: true }), F('warehouse_id', 'المخزن', 'ref', { ref: 'warehouses', required: true }),
      F('weight', 'الوزن (كجم)', 'number', { list: true, required: true }), F('est_value', 'القيمة التقديرية', 'money', { list: true }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 }),
    ],
  },
  scrap_sales: {
    table: 'scrap_sales', perm: 'scrap', title: 'بيع الخردة', single: 'بيع خردة', icon: 'coins', approvable: true, dateField: 'sale_date', printable: true,
    fields: [
      F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('sale_date', 'التاريخ', 'date', { default: today, list: true }),
      F('buyer_id', 'المشتري', 'ref', { ref: 'parties', list: true, required: true }), F('warehouse_id', 'من مخزن', 'ref', { ref: 'warehouses', required: true }),
      F('vehicle_no', 'رقم السيارة', 'text'), F('total', 'الإجمالي', 'money', { readonly: true, list: true }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 }),
    ],
    lines: { table: 'scrap_sale_lines', title: 'الخردة المباعة', priced: true, simpleTotal: true, fields: itemLine([F('batch_no', 'التشغيلة', 'batch'), F('qty', 'الوزن / الكمية', 'number', { required: true }), F('price', 'السعر', 'money'), F('_total', 'الإجمالي', 'calc', { calc: (l) => (Number(l.qty) || 0) * (Number(l.price) || 0), money: true })]) },
  },
  machines: {
    table: 'machines', perm: 'machines', title: 'الماكينات', single: 'ماكينة', icon: 'machine', order: 'name', asc: true, detail: 'machine',
    fields: [
      F('code', 'رقم الماكينة', 'text', { list: true, search: true }), F('name', 'اسم الماكينة', 'text', { required: true, list: true, search: true, w: 2 }),
      F('department', 'القسم', 'text', { list: true, filter: true }), F('kind', 'النوع', 'text', { suggest: ['مقص', 'ثناية', 'مخرطة', 'فريزة', 'ماكينة لحام', 'ليزر', 'بلازما', 'مكبس', 'دريل', 'كمبروسر'] }),
      F('brand', 'الماركة / الموديل', 'text'), F('purchase_date', 'تاريخ الشراء', 'date'),
      F('hour_rate', 'تكلفة ساعة التشغيل', 'money', { help: 'بتتحسب في تكلفة أوامر التشغيل' }), F('hours_run', 'ساعات التشغيل', 'number', { list: true }),
      F('status', 'الحالة', 'select', { options: 'machine_status', list: true, filter: true }),
      F('maintenance_every_days', 'صيانة دورية كل (يوم)', 'number'), F('next_maintenance_date', 'الصيانة الجاية', 'date', { list: true }),
      F('technician', 'الفني المسؤول', 'text', { list: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'نشطة', 'check', { default: true }),
    ],
  },
  machine_logs: {
    table: 'machine_logs', perm: 'machines', title: 'سجل صيانة الماكينات', single: 'صيانة / عطل', icon: 'wrench', dateField: 'log_date',
    fields: [
      F('log_date', 'التاريخ', 'date', { default: today, list: true }), F('machine_id', 'الماكينة', 'ref', { ref: 'machines', required: true, list: true, filter: true }),
      F('kind', 'النوع', 'select', { options: 'machine_log', list: true, filter: true }), F('description', 'الوصف', 'text', { w: 2, list: true }),
      F('parts_used', 'قطع الغيار المستخدمة', 'text', { w: 2 }), F('cost', 'التكلفة', 'money', { list: true }), F('downtime_hours', 'ساعات التوقف', 'number', { list: true }),
      F('technician', 'الفني', 'text', { list: true }), F('next_due_date', 'الصيانة الجاية', 'date', { help: 'بيتحدث في ملف الماكينة' }), F('notes', 'ملاحظات', 'textarea', { w: 3 }),
    ],
  },

  // ═════════ المشتريات ═════════
  purchase_requests: {
    table: 'purchase_requests', perm: 'purchasing', title: 'طلبات الشراء', single: 'طلب شراء', icon: 'cart', statusOpt: 'pr_status', approvable: true, dateField: 'req_date', printable: true,
    fields: [F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('req_date', 'التاريخ', 'date', { default: today, list: true }),
      F('requested_by', 'مقدم الطلب', 'text', { list: true }), F('department', 'القسم', 'text', { list: true }), F('needed_by', 'مطلوب قبل', 'date', { list: true }),
      F('reason', 'السبب', 'text', { w: 3 }), F('status', 'الحالة', 'select', { options: 'pr_status', readonly: true, list: true, filter: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 })],
    lines: { table: 'pr_lines', title: 'الأصناف المطلوبة', fields: itemLine([F('_stock', 'الرصيد الحالي', 'stockcalc'), F('qty', 'الكمية', 'number', { required: true }), F('notes', 'ملاحظات', 'text', { w: 2 })]) },
  },
  purchase_orders: {
    table: 'purchase_orders', perm: 'purchasing', title: 'أوامر الشراء', single: 'أمر شراء', icon: 'doc', statusOpt: 'po_status', approvable: true, dateField: 'po_date', printable: true,
    fields: [F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('po_date', 'التاريخ', 'date', { default: today, list: true }),
      F('supplier_id', 'المورد', 'ref', { ref: 'parties', required: true, list: true, filter: true }), F('pr_id', 'طلب الشراء', 'ref', { ref: 'purchase_requests' }),
      F('expected_date', 'تاريخ التوريد المتوقع', 'date'), F('payment_terms', 'شروط الدفع', 'text'),
      F('status', 'الحالة', 'select', { options: 'po_status', readonly: true, list: true, filter: true }), ...totalsFields, F('notes', 'ملاحظات', 'textarea', { w: 3 })],
    lines: { table: 'po_lines', title: 'الأصناف', priced: true, fields: [...pricedLines().fields.filter((f) => f.k !== 'description'), F('received_qty', 'المستلم', 'number', { readonly: true })] },
  },
  supplier_invoices: {
    table: 'supplier_invoices', perm: 'purchasing', title: 'فواتير الموردين', single: 'فاتورة مورد', icon: 'receipt', approvable: true, dateField: 'inv_date', printable: true,
    intro: 'بعد الاعتماد الفاتورة بتتسجل على حساب المورد',
    fields: [F('no', 'رقم داخلي', 'text', { readonly: true, list: true, search: true }), F('supplier_ref', 'رقم فاتورة المورد', 'text', { list: true, search: true }),
      F('inv_date', 'التاريخ', 'date', { default: today, list: true }), F('due_date', 'تاريخ الاستحقاق', 'date', { list: true }),
      F('supplier_id', 'المورد', 'ref', { ref: 'parties', required: true, list: true, filter: true }), F('po_id', 'أمر الشراء', 'ref', { ref: 'purchase_orders' }), F('gate_in_id', 'إذن الدخول', 'ref', { ref: 'gate_in' }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), ...totalsFields, F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'صورة الفاتورة', 'files')],
    lines: pricedLines('sinv_lines'),
  },

  // ═════════ المبيعات ═════════
  quotations: {
    table: 'quotations', perm: 'sales', title: 'عروض الأسعار', single: 'عرض سعر', icon: 'tag', statusOpt: 'q_status', dateField: 'q_date', printable: true,
    fields: [F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('q_date', 'التاريخ', 'date', { default: today, list: true }), F('valid_until', 'صالح حتى', 'date'),
      F('customer_id', 'العميل', 'ref', { ref: 'parties', required: true, list: true, filter: true }), F('project', 'المشروع', 'text', { list: true }),
      F('status', 'الحالة', 'select', { options: 'q_status', list: true, filter: true }), ...totalsFields, F('terms', 'الشروط', 'textarea', { w: 3 }), F('notes', 'ملاحظات', 'textarea', { w: 3 })],
    lines: pricedLines('quotation_lines'),
  },
  sales_orders: {
    table: 'sales_orders', perm: 'sales', title: 'أوامر البيع', single: 'أمر بيع', icon: 'doc', statusOpt: 'so_status', approvable: true, dateField: 'so_date', printable: true,
    fields: [F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('so_date', 'التاريخ', 'date', { default: today, list: true }), F('delivery_date', 'تاريخ التسليم', 'date', { list: true }),
      F('customer_id', 'العميل', 'ref', { ref: 'parties', required: true, list: true, filter: true }), F('quotation_id', 'عرض السعر', 'ref', { ref: 'quotations' }), F('project', 'المشروع', 'text'),
      F('status', 'الحالة', 'select', { options: 'so_status', list: true, filter: true, editableApproved: true }), ...totalsFields, F('notes', 'ملاحظات', 'textarea', { w: 3 })],
    lines: pricedLines('so_lines'),
  },
  sales_invoices: {
    table: 'sales_invoices', perm: 'sales', title: 'فواتير المبيعات', single: 'فاتورة مبيعات', icon: 'receipt', approvable: true, dateField: 'inv_date', printable: true,
    intro: 'بعد الاعتماد الفاتورة بتتسجل على حساب العميل',
    fields: [F('no', 'رقم الفاتورة', 'text', { readonly: true, list: true, search: true }), F('inv_date', 'التاريخ', 'date', { default: today, list: true }), F('due_date', 'تاريخ الاستحقاق', 'date', { list: true }),
      F('customer_id', 'العميل', 'ref', { ref: 'parties', required: true, list: true, filter: true }), F('so_id', 'أمر البيع', 'ref', { ref: 'sales_orders' }), F('gate_out_id', 'إذن الخروج', 'ref', { ref: 'gate_out' }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), ...totalsFields, F('notes', 'ملاحظات', 'textarea', { w: 3 })],
    lines: pricedLines('si_lines'),
  },

  // ═════════ النقل ═════════
  drivers: {
    table: 'drivers', perm: 'drivers', title: 'السائقين', single: 'سائق', icon: 'driver', order: 'name', asc: true, detail: 'driver',
    fields: [F('name', 'اسم السائق', 'text', { required: true, list: true, search: true, w: 2 }), F('phone', 'رقم الهاتف', 'text', { list: true, search: true }),
      F('vehicle_id', 'السيارة', 'ref', { ref: 'vehicles', list: true }), F('license_no', 'رقم الرخصة', 'text'), F('license_expiry', 'انتهاء الرخصة', 'date', { list: true }),
      F('pay_type', 'نظام الحساب', 'select', { options: 'pay_type', list: true }), F('salary', 'الراتب', 'money'), F('opening_balance', 'رصيد أول المدة (مستحق له)', 'money'),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'نشط', 'check', { default: true })],
  },
  trips: {
    table: 'trips', perm: 'drivers', title: 'الرحلات', single: 'رحلة', icon: 'route', approvable: true, dateField: 'trip_date', printable: true,
    intro: 'صافي مستحق السائق = قيمة النقلة − السولار − الرسوم − المصروفات − السلفة',
    fields: [F('no', 'رقم الرحلة', 'text', { readonly: true, list: true, search: true }), F('trip_date', 'التاريخ', 'date', { default: today, list: true }),
      F('driver_id', 'السائق', 'ref', { ref: 'drivers', required: true, list: true, filter: true, fills: { vehicle_id: 'vehicle_id' } }), F('vehicle_id', 'السيارة', 'ref', { ref: 'vehicles', list: true }),
      F('from_place', 'من', 'text', { list: true }), F('to_place', 'إلى', 'text', { list: true }), F('party_id', 'العميل أو المورد', 'ref', { ref: 'parties' }),
      F('load_ref', 'رقم أمر التحميل', 'text'), F('gate_out_id', 'إذن الخروج', 'ref', { ref: 'gate_out' }), F('distance_km', 'المسافة (كم)', 'number'),
      F('fare', 'قيمة النقلة', 'money', { list: true, group: 'money' }), F('fuel', 'السولار', 'money', { group: 'money' }), F('tolls', 'رسوم الطريق', 'money', { group: 'money' }),
      F('other_exp', 'مصروفات أخرى', 'money', { group: 'money' }), F('advance', 'سلفة السائق', 'money', { group: 'money' }), F('cashbox_id', 'السلفة اتصرفت من', 'ref', { ref: 'cashboxes', group: 'money' }),
      F('_net', 'المستحق للسائق', 'calc', { list: true, money: true, group: 'money', calc: (r) => (Number(r.fare) || 0) - (Number(r.fuel) || 0) - (Number(r.tolls) || 0) - (Number(r.other_exp) || 0) - (Number(r.advance) || 0) }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 })],
  },
  driver_transactions: {
    table: 'driver_transactions', perm: 'drivers', title: 'سلف وخصومات السائقين', single: 'حركة سائق', icon: 'wallet', dateField: 'tx_date',
    fields: [F('tx_date', 'التاريخ', 'date', { default: today, list: true }), F('driver_id', 'السائق', 'ref', { ref: 'drivers', required: true, list: true, filter: true }),
      F('kind', 'النوع', 'select', { options: 'driver_tx', required: true, list: true, filter: true }), F('amount', 'المبلغ', 'money', { required: true, list: true }),
      F('cashbox_id', 'اتصرفت من خزينة', 'ref', { ref: 'cashboxes', show: (r) => ['advance', 'salary'].includes(r.kind), help: 'اختياري — لو اختارت خزينة المبلغ بيتخصم منها' }), F('notes', 'ملاحظات', 'text', { w: 2, list: true })],
  },
  vehicles: {
    table: 'vehicles', perm: 'vehicles', title: 'السيارات', single: 'سيارة', icon: 'truck', order: 'plate_no', asc: true, detail: 'vehicle',
    fields: [F('plate_no', 'رقم السيارة', 'text', { required: true, list: true, search: true }), F('kind', 'نوع السيارة', 'text', { list: true, suggest: ['نقل ثقيل', 'جامبو', 'نصف نقل', 'تريلا', 'ونش', 'كلارك'] }),
      F('model', 'الموديل', 'text'), F('year', 'سنة الصنع', 'number'), F('capacity_ton', 'الحمولة (طن)', 'number'),
      F('driver_id', 'السائق', 'ref', { ref: 'drivers', list: true }), F('odometer', 'عداد الكيلومترات', 'number', { list: true }), F('fuel_type', 'نوع الوقود', 'select', { options: 'fuel' }),
      F('license_expiry', 'انتهاء الترخيص', 'date', { list: true }), F('insurance_expiry', 'انتهاء التأمين', 'date', { list: true }),
      F('next_service_date', 'الصيانة الجاية', 'date'), F('next_service_km', 'الصيانة الجاية (كم)', 'number'), F('next_oil_date', 'تغيير الزيت الجاي', 'date'), F('next_oil_km', 'تغيير الزيت عند (كم)', 'number'),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'نشطة', 'check', { default: true })],
  },
  vehicle_logs: {
    table: 'vehicle_logs', perm: 'vehicles', title: 'صيانة ووقود السيارات', single: 'سجل سيارة', icon: 'wrench', dateField: 'log_date',
    fields: [F('log_date', 'التاريخ', 'date', { default: today, list: true }), F('vehicle_id', 'السيارة', 'ref', { ref: 'vehicles', required: true, list: true, filter: true }),
      F('kind', 'النوع', 'select', { options: 'vehicle_log', list: true, filter: true }), F('odometer', 'العداد (كم)', 'number', { list: true }), F('liters', 'لترات الوقود', 'number', { show: (r) => r.kind === 'fuel' }),
      F('cost', 'التكلفة', 'money', { list: true }), F('workshop', 'الورشة / المحطة', 'text'), F('next_due_date', 'الموعد الجاي', 'date', { help: 'بيتحدث في ملف السيارة' }), F('next_due_km', 'الموعد الجاي (كم)', 'number'),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'إيصالات', 'files')],
  },

  // ═════════ الحسابات ═════════
  cashboxes: {
    table: 'cashboxes', perm: 'treasury', title: 'الخزائن والبنوك', single: 'خزينة', icon: 'safe', order: 'name', asc: true, detail: 'cashbox',
    fields: [F('name', 'الاسم', 'text', { required: true, list: true, w: 2 }), F('kind', 'النوع', 'select', { options: 'cashbox_kind', list: true }),
      F('bank_name', 'البنك', 'text', { list: true }), F('account_no', 'رقم الحساب', 'text'), F('opening_balance', 'رصيد أول المدة', 'money', { list: true }),
      F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'نشطة', 'check', { default: true })],
  },
  cash_transactions: {
    table: 'cash_transactions', perm: 'treasury', title: 'القبض والصرف', single: 'حركة خزينة', icon: 'cash', approvable: true, dateField: 'tx_date', printable: true,
    intro: 'تحصيل العملاء، دفع الموردين، صرف مستحقات السائقين والموظفين، والتحويل بين الخزائن',
    fields: [F('no', 'رقم السند', 'text', { readonly: true, list: true, search: true }), F('tx_date', 'التاريخ', 'date', { default: today, list: true }),
      F('kind', 'نوع الحركة', 'select', { options: 'cash_kind', required: true, list: true, filter: true }), F('cashbox_id', 'الخزينة', 'ref', { ref: 'cashboxes', required: true, list: true, filter: true }),
      F('to_cashbox_id', 'إلى خزينة', 'ref', { ref: 'cashboxes', show: (r) => r.kind === 'transfer' }),
      F('party_type', 'الجهة', 'select', { options: 'cash_party', show: (r) => r.kind !== 'transfer' }),
      F('party_id', 'العميل / المورد', 'ref', { ref: 'parties', list: true, show: (r) => r.kind !== 'transfer' && ['customer', 'supplier'].includes(r.party_type), balanceOf: 'party' }),
      F('driver_id', 'السائق', 'ref', { ref: 'drivers', show: (r) => r.kind !== 'transfer' && r.party_type === 'driver', balanceOf: 'driver' }),
      F('employee_id', 'الموظف', 'ref', { ref: 'employees', show: (r) => r.kind !== 'transfer' && r.party_type === 'employee' }),
      F('amount', 'المبلغ', 'money', { required: true, list: true }), F('method', 'طريقة الدفع', 'select', { options: 'method', list: true }),
      F('reference', 'رقم الشيك / التحويل', 'text'), F('cheque_due', 'تاريخ استحقاق الشيك', 'date', { show: (r) => r.method === 'cheque' }),
      F('description', 'البيان', 'text', { w: 3, list: true, search: true }), F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), F('attachments', 'مرفقات', 'files')],
  },
  expenses: {
    table: 'expenses', perm: 'expenses', title: 'المصروفات', single: 'مصروف', icon: 'bill', approvable: true, dateField: 'exp_date', printable: true,
    fields: [F('no', 'الرقم', 'text', { readonly: true, list: true, search: true }), F('exp_date', 'التاريخ', 'date', { default: today, list: true }),
      F('category', 'البند', 'refname', { ref: 'expense_categories', required: true, list: true, filter: true }), F('amount', 'المبلغ', 'money', { required: true, list: true }),
      F('description', 'البيان', 'text', { w: 2, list: true, search: true }), F('cashbox_id', 'اتصرف من خزينة', 'ref', { ref: 'cashboxes', list: true }),
      F('paid_to', 'اتدفع لـ', 'text'), F('receipt_no', 'رقم الإيصال', 'text'),
      F('vehicle_id', 'السيارة (لو مصروف سيارة)', 'ref', { ref: 'vehicles' }), F('machine_id', 'الماكينة', 'ref', { ref: 'machines' }), F('wo_id', 'أمر التشغيل (مصروف مباشر)', 'ref', { ref: 'work_orders' }),
      F('status', 'الحالة', 'select', { options: 'status', readonly: true, list: true, filter: true }), F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('attachments', 'صورة الفاتورة / الإيصال', 'files')],
  },
  expense_categories: {
    table: 'expense_categories', perm: 'expenses', title: 'بنود المصروفات', single: 'بند', icon: 'list', order: 'sort', asc: true,
    fields: [F('name', 'اسم البند', 'text', { required: true, list: true, w: 2 }), F('kind', 'التصنيف', 'select', { options: 'exp_kind', list: true }), F('sort', 'الترتيب', 'number', { list: true }), F('active', 'نشط', 'check', { default: true, list: true })],
  },

  // ═════════ الموظفين ═════════
  employees: {
    table: 'employees', perm: 'employees', title: 'الموظفين والعمال', single: 'موظف', icon: 'id', order: 'name', asc: true, detail: 'employee',
    fields: [F('code', 'الكود', 'text', { list: true, search: true }), F('name', 'الاسم', 'text', { required: true, list: true, search: true, w: 2 }), F('phone', 'الهاتف', 'text', { list: true }),
      F('department', 'القسم', 'text', { list: true, filter: true, suggest: ['الإنتاج', 'المخازن', 'الحسابات', 'المبيعات', 'المشتريات', 'الجودة', 'الصيانة', 'الأمن', 'الإدارة'] }), F('job_title', 'الوظيفة', 'text', { list: true }),
      F('hire_date', 'تاريخ التعيين', 'date'), F('salary', 'الراتب', 'money', { list: true }), F('pay_period', 'دورية القبض', 'select', { options: 'pay_period' }),
      F('hour_rate', 'تكلفة الساعة', 'money', { help: 'بتتحسب في تكلفة مراحل التشغيل' }), F('address', 'العنوان', 'text', { w: 2 }), F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'على رأس العمل', 'check', { default: true })],
  },
  attendance: {
    table: 'attendance', perm: 'employees', title: 'الحضور والانصراف', single: 'تسجيل حضور', icon: 'clock', dateField: 'att_date',
    fields: [F('att_date', 'التاريخ', 'date', { default: today, list: true }), F('employee_id', 'الموظف', 'ref', { ref: 'employees', required: true, list: true, filter: true }),
      F('status', 'الحالة', 'select', { options: 'att_status', list: true, filter: true }), F('check_in', 'الحضور', 'time', { list: true }), F('check_out', 'الانصراف', 'time', { list: true }),
      F('overtime_hours', 'ساعات إضافي', 'number', { list: true }), F('notes', 'ملاحظات', 'text', { w: 2 })],
  },
  employee_transactions: {
    table: 'employee_transactions', perm: 'employees', title: 'السلف والخصومات والإضافي', single: 'حركة موظف', icon: 'wallet', dateField: 'tx_date',
    fields: [F('tx_date', 'التاريخ', 'date', { default: today, list: true }), F('employee_id', 'الموظف', 'ref', { ref: 'employees', required: true, list: true, filter: true }),
      F('kind', 'النوع', 'select', { options: 'emp_tx', required: true, list: true, filter: true }), F('amount', 'المبلغ', 'money', { list: true }), F('days', 'عدد الأيام (للإجازة)', 'number', { show: (r) => r.kind === 'leave' }),
      F('cashbox_id', 'اتصرفت من خزينة', 'ref', { ref: 'cashboxes', show: (r) => ['advance', 'salary_payment'].includes(r.kind) }), F('notes', 'ملاحظات', 'text', { w: 2, list: true })],
  },
}

function partyFields() {
  return [
    F('code', 'الكود', 'text', { list: true, search: true }), F('name', 'الاسم', 'text', { required: true, list: true, search: true, w: 2 }),
    F('kind', 'النوع', 'select', { options: 'party_kind', list: true, filter: true }), F('contact_person', 'المسؤول', 'text'),
    F('phone', 'الهاتف', 'text', { list: true, search: true }), F('phone2', 'هاتف آخر', 'text'), F('email', 'الإيميل', 'text'),
    F('address', 'العنوان', 'text', { w: 2 }), F('tax_no', 'الرقم الضريبي', 'text'), F('commercial_reg', 'السجل التجاري', 'text'),
    F('opening_balance', 'رصيد أول المدة', 'money', { help: 'موجب = مديونية عليه لينا، سالب = مستحق له علينا' }), F('credit_limit', 'حد الائتمان', 'money'),
    F('payment_terms', 'شروط الدفع', 'text'), F('notes', 'ملاحظات', 'textarea', { w: 3 }), F('active', 'نشط', 'check', { default: true }),
  ]
}

// ═════════ القايمة الجانبية ═════════
// [المفتاح، العنوان، الأيقونة، الصلاحية]   — المفتاح يا إما قسم في MODULES أو صفحة خاصة تبدأ بـ «/»
export const NAV = [
  ['الرئيسية', [['/', 'لوحة التحكم', 'home', 'dashboard']]],
  ['البيانات الأساسية', [['material_types', null, null], ['items', null, null], ['warehouses', null, null], ['customers', null, null], ['suppliers', null, null]]],
  ['المخازن', [['/stock', 'أرصدة المخزون', 'chart', 'stock'], ['stock_docs', null, null], ['/trace', 'تتبع الخامة', 'trace', 'stock']]],
  ['البوابة', [['gate_in', null, null], ['gate_out', null, null]]],
  ['الإنتاج', [['work_orders', null, null], ['process_stages', null, null], ['qc_inspections', null, null], ['scrap_records', null, null], ['scrap_sales', null, null], ['/costing', 'تكلفة الإنتاج', 'calc', 'costing']]],
  ['الصيانة والماكينات', [['machines', null, null], ['machine_logs', null, null]]],
  ['المشتريات', [['purchase_requests', null, null], ['purchase_orders', null, null], ['supplier_invoices', null, null]]],
  ['المبيعات', [['quotations', null, null], ['sales_orders', null, null], ['sales_invoices', null, null]]],
  ['النقل', [['drivers', null, null], ['trips', null, null], ['driver_transactions', null, null], ['vehicles', null, null], ['vehicle_logs', null, null]]],
  ['الحسابات', [['cashboxes', null, null], ['cash_transactions', null, null], ['expenses', null, null], ['expense_categories', null, null], ['/balances', 'أرصدة العملاء والموردين', 'scale', 'parties'], ['/pnl', 'الأرباح والخسائر', 'coins', 'reports']]],
  ['الموظفين', [['employees', null, null], ['attendance', null, null], ['employee_transactions', null, null]]],
  ['التقارير', [['/reports', 'مركز التقارير', 'report', 'reports'], ['/periodic', 'تقارير أسبوعية وشهرية وسنوية', 'download', 'reports'], ['/system-report', 'تقرير النظام', 'chart', 'reports']]],
  ['النظام', [['/users', 'المستخدمين والصلاحيات', 'lock', 'users'], ['/audit', 'سجل العمليات', 'history', 'audit'], ['/settings', 'الإعدادات', 'settings', 'settings']]],
]

// اسم أي سجل لما يظهر في قايمة منسدلة
export const REF_LABEL = {
  items: (r) => `${r.code ? r.code + ' — ' : ''}${r.name}`,
  parties: (r) => r.name,
  warehouses: (r) => r.name,
  material_types: (r) => r.name + (r.grade ? ` (${r.grade})` : ''),
  machines: (r) => `${r.code ? r.code + ' — ' : ''}${r.name}`,
  employees: (r) => r.name,
  drivers: (r) => r.name,
  vehicles: (r) => r.plate_no + (r.kind ? ` — ${r.kind}` : ''),
  cashboxes: (r) => r.name,
  process_stages: (r) => r.name,
  expense_categories: (r) => r.name,
  work_orders: (r) => r.no + (r.project ? ` — ${r.project}` : ''),
  purchase_orders: (r) => r.no,
  purchase_requests: (r) => r.no,
  sales_orders: (r) => r.no,
  sales_invoices: (r) => r.no,
  quotations: (r) => r.no,
  gate_in: (r) => r.no + (r.vehicle_no ? ` — ${r.vehicle_no}` : ''),
  gate_out: (r) => r.no,
}

// جداول المستندات اللي بتتحمل في القوائم المنسدلة (آخر 500 بس)
export const DOC_REFS = ['work_orders', 'purchase_orders', 'purchase_requests', 'sales_orders', 'sales_invoices', 'quotations', 'gate_in', 'gate_out']
