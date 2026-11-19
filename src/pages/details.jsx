// تفاصيل إضافية تحت كل نموذج: كشوف الحساب، حركة الصنف، تكلفة أمر التشغيل...
import { useMemo } from 'react'
import { backend } from '../lib/backend'
import { useLoad, useRefMap, useAuth, go, Link } from '../lib/app'
import { fmtDate, fmtDateTime, num, money, n, label, monthStart, today } from '../lib/format'
import { Btn, DataTable, Spinner, ErrorBox, Stat, Badge } from '../ui/kit'
import { downloadXlsx } from '../lib/xlsx'
import { openPrint, companyHeader, table as ptable, esc } from '../lib/print'
import { code128Svg } from '../lib/barcode'

const DOC_LINK = { gate_in: 'gate_in', gate_out: 'gate_out', stock_docs: 'stock_docs', scrap_records: 'scrap_records', scrap_sales: 'scrap_sales', sales_invoices: 'sales_invoices', supplier_invoices: 'supplier_invoices', cash_transactions: 'cash_transactions', expenses: 'expenses', trips: 'trips' }
const DOC_NAME = { gate_in: 'إذن دخول', gate_out: 'إذن خروج', stock_docs: 'إذن مخزن', scrap_records: 'هالك', scrap_sales: 'بيع خردة', sales_invoices: 'فاتورة مبيعات', supplier_invoices: 'فاتورة مورد', cash_transactions: 'سند خزينة', expenses: 'مصروف', trips: 'رحلة', opening: 'رصيد أول المدة', driver_transactions: 'حركة سائق', employee_transactions: 'حركة موظف' }
export const docLink = (t, id, no) => (DOC_LINK[t] && id ? <Link to={`/m/${DOC_LINK[t]}/${id}`}>{no || DOC_NAME[t]}</Link> : (no || '—'))
export { DOC_NAME }

// كشف حساب بالرصيد المتراكم
export function withRunning(rows, debitKey, creditKey) {
  const sorted = [...rows].sort((a, b) => String(a.entry_date || '0000').localeCompare(String(b.entry_date || '0000')) || (a.doc_type === 'opening' ? -1 : 0))
  let bal = 0
  return sorted.map((r) => { bal += n(r[debitKey]) - n(r[creditKey]); return { ...r, running: bal } })
}

function Section({ title, children, actions }) {
  return <div className="card"><div className="card-h"><h3 className="card-t">{title}</h3><div className="card-a">{actions}</div></div>{children}</div>
}

// ═════════ الصنف: الرصيد وحركة الصنف والباركود ═════════
function ItemDetail({ row }) {
  const whs = useRefMap('warehouses')
  const { settings } = useAuth()
  const bal = useLoad(() => backend.list('v_stock_balance', { filters: [['item_id', 'eq', row.id]] }), [row.id])
  const moves = useLoad(() => backend.list('stock_moves', { filters: [['item_id', 'eq', row.id]], order: 'created_at', asc: true }), [row.id])
  const ledger = useMemo(() => { let b = 0; return (moves.data || []).map((m) => { b += n(m.qty); return { ...m, running: b } }).reverse() }, [moves.data])
  const total = (bal.data || []).reduce((s, x) => s + n(x.qty), 0)
  const printLabels = () => {
    const code = row.barcode || row.code
    const lab = `<div class="label"><b>${esc(row.name)}</b>${code128Svg(code, { height: 44 })}<small>${esc(row.size || '')}</small></div>`
    openPrint('ملصقات باركود ' + row.code, `<div class="labels">${Array(12).fill(lab).join('')}</div>`)
  }
  const exportLedger = () => downloadXlsx(`حركة صنف ${row.code}`, [{
    name: 'حركة الصنف', title: `حركة الصنف: ${row.code} — ${row.name}`,
    columns: [{ label: 'التاريخ', key: 'move_date', value: (r) => fmtDate(r.move_date) }, { label: 'المستند', key: 'doc_no' }, { label: 'البيان', key: 'reason' }, { label: 'المخزن', value: (r) => whs[r.warehouse_id]?.name },
      { label: 'التشغيلة', key: 'batch_no' }, { label: 'وارد', type: 'num', value: (r) => (r.qty > 0 ? n(r.qty) : '') }, { label: 'منصرف', type: 'num', value: (r) => (r.qty < 0 ? -n(r.qty) : '') }, { label: 'الرصيد', key: 'running', type: 'num' }, { label: 'التكلفة', key: 'unit_cost', type: 'money' }],
    rows: [...ledger].reverse(),
  }])
  return <>
    <div className="stats">
      <Stat label="الرصيد الحالي" value={num(total, 3) + ' ' + label('unit', row.unit)} icon="box" tone={n(row.reorder_level) && total <= n(row.reorder_level) ? 'red' : 'blue'} sub={n(row.reorder_level) ? `حد الطلب ${num(row.reorder_level)}` : ''} />
      <Stat label="قيمة المخزون" value={money(total * n(row.avg_cost))} icon="coins" tone="amber" sub={`متوسط التكلفة ${money(row.avg_cost)}`} />
      <Stat label="الوزن الإجمالي" value={row.unit === 'kg' ? num(total, 2) + ' كجم' : row.unit === 'ton' ? num(total * 1000, 2) + ' كجم' : row.weight_per_unit ? num(total * n(row.weight_per_unit), 2) + ' كجم' : '—'} icon="scale" tone="green" />
    </div>
    <Section title="الرصيد في كل مخزن وتشغيلة" actions={<Btn size="sm" icon="barcode" onClick={printLabels}>طباعة ملصقات باركود</Btn>}>
      {bal.loading ? <Spinner /> : <DataTable dense rows={bal.data || []} rowKey="batch_no" columns={[
        { key: 'w', label: 'المخزن', value: (r) => whs[r.warehouse_id]?.name }, { key: 'batch_no', label: 'التشغيلة', render: (r) => r.batch_no ? <Link to="/trace" query={{ batch: r.batch_no }}>{r.batch_no}</Link> : '—' },
        { key: 'qty', label: 'الكمية', num: true, d: 3 }, { key: 'value', label: 'القيمة', money: true }, { key: 'last_move', label: 'آخر حركة', value: (r) => fmtDate(r.last_move) }]} />}
    </Section>
    <Section title="سجل حركة الصنف (دخل إمتى — خرج إمتى — مين — ليه)" actions={<Btn size="sm" icon="excel" onClick={exportLedger} disabled={!ledger.length}>Excel</Btn>}>
      {moves.loading ? <Spinner /> : moves.error ? <ErrorBox error={moves.error} /> : <DataTable dense rows={ledger} columns={[
        { key: 'move_date', label: 'التاريخ', value: (r) => fmtDate(r.move_date), sortValue: (r) => r.created_at }, { key: 'doc', label: 'المستند', render: (r) => docLink(r.doc_type, r.doc_id, r.doc_no) },
        { key: 'reason', label: 'سبب الحركة' }, { key: 'w', label: 'المخزن', value: (r) => whs[r.warehouse_id]?.name }, { key: 'batch_no', label: 'التشغيلة' },
        { key: 'in', label: 'وارد', num: true, value: (r) => (r.qty > 0 ? n(r.qty) : null), d: 3 }, { key: 'out', label: 'منصرف', num: true, value: (r) => (r.qty < 0 ? -n(r.qty) : null), d: 3 },
        { key: 'running', label: 'الرصيد', num: true, d: 3 }, { key: 'unit_cost', label: 'التكلفة', money: true }, { key: 'created_at', label: 'وقت التسجيل', value: (r) => fmtDateTime(r.created_at) }]} />}
    </Section>
  </>
}

// ═════════ العميل / المورد: كشف الحساب ═════════
function PartyDetail({ row }) {
  const { settings } = useAuth()
  const led = useLoad(() => backend.list('v_party_ledger', { filters: [['party_id', 'eq', row.id]] }), [row.id])
  const rows = useMemo(() => withRunning(led.data || [], 'debit', 'credit'), [led.data])
  const bal = rows.length ? rows[rows.length - 1].running : 0
  const td = rows.reduce((s, r) => s + n(r.debit), 0), tc = rows.reduce((s, r) => s + n(r.credit), 0)
  const cols = [{ label: 'التاريخ', value: (r) => fmtDate(r.entry_date) }, { label: 'المستند', value: (r) => r.doc_no || '' }, { label: 'البيان', key: 'description' },
    { label: 'مدين (عليه)', num: true, value: (r) => (n(r.debit) ? money(r.debit) : '') }, { label: 'دائن (له)', num: true, value: (r) => (n(r.credit) ? money(r.credit) : '') }, { label: 'الرصيد', num: true, value: (r) => money(r.running) }]
  const print = () => openPrint('كشف حساب ' + row.name, companyHeader(settings.company, 'كشف حساب', row.name, fmtDate(today())) +
    `<div class="kpis"><div><span>إجمالي مدين</span><b>${money(td)}</b></div><div><span>إجمالي دائن</span><b>${money(tc)}</b></div><div><span>الرصيد</span><b>${money(Math.abs(bal))}</b></div><div><span>الحالة</span><b>${bal > 0 ? 'مديونية عليه' : bal < 0 ? 'مستحق له' : 'خالص'}</b></div></div>` + ptable(cols, rows))
  const xl = () => downloadXlsx('كشف حساب ' + row.name, [{ name: 'كشف حساب', title: 'كشف حساب: ' + row.name, columns: [
    { label: 'التاريخ', value: (r) => fmtDate(r.entry_date) }, { label: 'المستند', key: 'doc_no' }, { label: 'البيان', key: 'description', width: 34 },
    { label: 'مدين', key: 'debit', type: 'money' }, { label: 'دائن', key: 'credit', type: 'money' }, { label: 'الرصيد', key: 'running', type: 'money' }], rows, totals: { debit: td, credit: tc, running: bal } }])
  return <>
    <div className="stats">
      <Stat label={bal >= 0 ? 'الرصيد (عليه لينا)' : 'الرصيد (مستحق له)'} value={money(Math.abs(bal))} icon="scale" tone={bal > 0 ? 'amber' : bal < 0 ? 'red' : 'green'} />
      <Stat label="إجمالي الفواتير والمديونية" value={money(td)} icon="receipt" />
      <Stat label="إجمالي المدفوع والدائن" value={money(tc)} icon="cash" tone="green" />
      <Stat label="آخر تعامل" value={fmtDate(rows.filter((r) => r.entry_date).slice(-1)[0]?.entry_date)} icon="clock" tone="gray" />
    </div>
    <Section title="كشف الحساب" actions={<><Btn size="sm" icon="cash" onClick={() => go('/m/cash_transactions/new', { kind: row.kind === 'supplier' ? 'payment' : 'receipt', party_type: row.kind === 'supplier' ? 'supplier' : 'customer', party_id: row.id })}>{row.kind === 'supplier' ? 'سداد للمورد' : 'تحصيل من العميل'}</Btn><Btn size="sm" icon="excel" onClick={xl} disabled={!rows.length}>Excel</Btn><Btn size="sm" icon="print" onClick={print}>طباعة / PDF</Btn></>}>
      {led.loading ? <Spinner /> : led.error ? <ErrorBox error={led.error} /> : <DataTable dense rows={rows} rowKey="doc_id" columns={[
        { key: 'entry_date', label: 'التاريخ', value: (r) => fmtDate(r.entry_date), sort: false }, { key: 'doc', label: 'المستند', render: (r) => docLink(r.doc_type, r.doc_id, r.doc_no), sort: false },
        { key: 'description', label: 'البيان', sort: false }, { key: 'debit', label: 'مدين (عليه)', money: true, sort: false }, { key: 'credit', label: 'دائن (له)', money: true, sort: false }, { key: 'running', label: 'الرصيد', money: true, sort: false }]}
        foot={{ __label: 'الإجمالي', debit: td, credit: tc, running: bal }} />}
    </Section>
  </>
}

// ═════════ أمر التشغيل: التكلفة والمستندات المرتبطة ═════════
function WoDetail({ row }) {
  const items = useRefMap('items')
  const cost = useLoad(() => backend.list('v_wo_cost', { filters: [['wo_id', 'eq', row.id]] }).then((r) => r[0]), [row.id, row.updated_at])
  const docs = useLoad(async () => {
    const [st, sc, qc, ex, mv] = await Promise.all([
      backend.list('stock_docs', { filters: [['work_order_id', 'eq', row.id]], order: 'doc_date' }),
      backend.list('scrap_records', { filters: [['wo_id', 'eq', row.id]], order: 'rec_date' }),
      backend.list('qc_inspections', { filters: [['wo_id', 'eq', row.id]], order: 'insp_date' }),
      backend.list('expenses', { filters: [['wo_id', 'eq', row.id]], order: 'exp_date' }),
      backend.list('stock_moves', { filters: [['work_order_id', 'eq', row.id]], order: 'created_at', asc: true }),
    ])
    return [...st.map((d) => ({ ...d, t: 'stock_docs', d: d.doc_date, l: label('stock_kind', d.kind) })), ...sc.map((d) => ({ ...d, t: 'scrap_records', d: d.rec_date, l: `هالك ${num(d.weight)} كجم` })),
      ...qc.map((d) => ({ ...d, t: 'qc_inspections', d: d.insp_date, l: `فحص جودة — مقبول ${num(d.qty_accepted)} / مرفوض ${num(d.qty_rejected)}` })), ...ex.map((d) => ({ ...d, t: 'expenses', d: d.exp_date, l: `مصروف ${d.category} — ${money(d.amount)}` }))]
      .sort((a, b) => String(a.d).localeCompare(String(b.d))).concat([{ __moves: mv }])
  }, [row.id, row.updated_at])
  const c = cost.data
  const moves = docs.data?.slice(-1)[0]?.__moves || []
  const list = (docs.data || []).filter((d) => !d.__moves)
  const issued = moves.filter((m) => m.qty < 0)
  const q = (kind) => ({ kind, work_order_id: row.id })
  const profit = c ? n(c.sale_value) - n(c.total_cost) : 0
  return <>
    <Section title="إجراءات سريعة على أمر التشغيل" actions={null}>
      <div className="quick">
        <Btn icon="truck-out" onClick={() => go('/m/stock_docs/new', q('issue'))}>صرف خامات للأمر</Btn>
        <Btn icon="box" onClick={() => go('/m/stock_docs/new', q('production'))}>استلام إنتاج تام</Btn>
        <Btn icon="recycle" onClick={() => go('/m/scrap_records/new', { wo_id: row.id, source: 'production' })}>تسجيل هالك</Btn>
        <Btn icon="check" onClick={() => go('/m/qc_inspections/new', { wo_id: row.id, item_id: row.product_item_id })}>فحص جودة</Btn>
        <Btn icon="bill" onClick={() => go('/m/expenses/new', { wo_id: row.id })}>مصروف مباشر</Btn>
      </div>
    </Section>
    <Section title="تكلفة وربحية أمر التشغيل">
      {cost.loading ? <Spinner /> : !c ? null : <>
        <div className="stats">
          <Stat label="الخام المصروف" value={num(c.issued_qty, 3)} icon="truck-out" sub={`تكلفته ${money(c.material_cost)}`} />
          <Stat label="الكمية المنتجة" value={num(c.produced_qty, 3)} icon="box" tone="green" sub={`المطلوب ${num(row.qty_required)}`} />
          <Stat label="الهالك" value={num(c.scrap_qty, 3) + ' كجم'} icon="recycle" tone={n(c.scrap_pct) > 8 ? 'red' : 'amber'} sub={`نسبة الهالك ${num(c.scrap_pct)}%`} />
          <Stat label="المرفوض (جودة)" value={num(c.rejected_qty)} icon="alert" tone="gray" />
        </div>
        <table className="cost-t">
          <tbody>
            <tr><td>تكلفة الخامات</td><td>{money(c.material_cost)}</td></tr>
            <tr><td>العمالة والماكينات من مراحل التشغيل</td><td>{money(n(c.stages_labor_cost) + n(c.stages_machine_cost))}</td></tr>
            <tr><td>عمالة / ماكينات / كهرباء / نقل / إضافي (يدوي)</td><td>{money(c.manual_costs)}</td></tr>
            <tr><td>مصروفات مباشرة على الأمر</td><td>{money(c.direct_expenses)}</td></tr>
            <tr><td>(−) قيمة الخردة المستردة</td><td>{money(c.scrap_value)}</td></tr>
            <tr className="tot"><td>تكلفة الإنتاج الفعلية</td><td>{money(c.total_cost)}</td></tr>
            <tr><td>تكلفة الوحدة</td><td>{n(c.produced_qty) ? money(n(c.total_cost) / n(c.produced_qty)) : '—'}</td></tr>
            <tr><td>سعر البيع</td><td>{money(c.sale_value)}</td></tr>
            <tr className={`tot ${profit < 0 ? 'neg' : 'pos'}`}><td>هامش الربح</td><td>{money(profit)} {n(c.sale_value) ? `(${num(profit / n(c.sale_value) * 100)}%)` : ''}</td></tr>
          </tbody>
        </table>
      </>}
    </Section>
    <Section title="المستندات المرتبطة">
      {docs.loading ? <Spinner /> : <DataTable dense rows={list} columns={[{ key: 'd', label: 'التاريخ', value: (r) => fmtDate(r.d) }, { key: 'no', label: 'الرقم', render: (r) => <Link to={`/m/${r.t}/${r.id}`}>{r.no}</Link> }, { key: 'l', label: 'البيان' }, { key: 'status', label: 'الحالة', render: (r) => <Badge value={r.status} /> }]} />}
    </Section>
    {issued.length > 0 && <Section title="الخامات المصروفة للأمر (بالتشغيلة)">
      <DataTable dense rows={issued} columns={[{ key: 'move_date', label: 'التاريخ', value: (r) => fmtDate(r.move_date) }, { key: 'i', label: 'الخامة', value: (r) => items[r.item_id]?.name }, { key: 'batch_no', label: 'التشغيلة', render: (r) => r.batch_no ? <Link to="/trace" query={{ batch: r.batch_no }}>{r.batch_no}</Link> : '—' }, { key: 'q', label: 'الكمية', num: true, d: 3, value: (r) => -n(r.qty) }, { key: 'c', label: 'التكلفة', money: true, value: (r) => -n(r.qty) * n(r.unit_cost) }]} />
    </Section>}
  </>
}

// ═════════ السائق: كشف المستحقات ═════════
function DriverDetail({ row }) {
  const { settings } = useAuth()
  const led = useLoad(() => backend.list('v_driver_ledger', { filters: [['driver_id', 'eq', row.id]] }), [row.id])
  const rows = useMemo(() => withRunning(led.data || [], 'credit', 'debit'), [led.data])
  const due = rows.length ? rows[rows.length - 1].running : 0
  const cols = [{ label: 'التاريخ', value: (r) => fmtDate(r.entry_date) }, { label: 'المستند', value: (r) => r.doc_no || DOC_NAME[r.doc_type] || '' }, { label: 'البيان', key: 'description' }, { label: 'له', num: true, value: (r) => (n(r.credit) ? money(r.credit) : '') }, { label: 'عليه', num: true, value: (r) => (n(r.debit) ? money(r.debit) : '') }, { label: 'الصافي', num: true, value: (r) => money(r.running) }]
  return <>
    <div className="stats">
      <Stat label="صافي مستحق السائق" value={money(due)} icon="wallet" tone={due > 0 ? 'amber' : 'green'} />
      <Stat label="عدد الرحلات" value={num(rows.filter((r) => r.doc_type === 'trips' && n(r.credit)).length)} icon="route" />
      <Stat label="إجمالي النقلات" value={money(rows.filter((r) => r.doc_type === 'trips').reduce((s, r) => s + n(r.credit), 0))} icon="truck" tone="green" />
    </div>
    <Section title="حساب السائق: إجمالي الرحلات − السلف − المصروفات − الخصومات" actions={<>
      <Btn size="sm" icon="route" onClick={() => go('/m/trips/new', { driver_id: row.id, vehicle_id: row.vehicle_id })}>رحلة جديدة</Btn>
      <Btn size="sm" icon="wallet" onClick={() => go('/m/driver_transactions/new', { driver_id: row.id, kind: 'advance' })}>سلفة / خصم</Btn>
      <Btn size="sm" icon="cash" onClick={() => go('/m/cash_transactions/new', { kind: 'payment', party_type: 'driver', driver_id: row.id, amount: due > 0 ? Math.round(due * 100) / 100 : undefined })}>صرف المستحقات</Btn>
      <Btn size="sm" icon="print" onClick={() => openPrint('حساب السائق ' + row.name, companyHeader(settings.company, 'كشف حساب سائق', row.name, fmtDate(today())) + ptable(cols, rows, { __label: 'صافي المستحق', 5: '' }) + `<h2>صافي المستحق: ${money(due)}</h2>`)}>طباعة</Btn></>}>
      {led.loading ? <Spinner /> : <DataTable dense rows={rows} rowKey="doc_id" columns={[{ key: 'entry_date', label: 'التاريخ', value: (r) => fmtDate(r.entry_date), sort: false }, { key: 'doc', label: 'المستند', render: (r) => docLink(r.doc_type, r.doc_id, r.doc_no), sort: false }, { key: 'description', label: 'البيان', sort: false }, { key: 'credit', label: 'له', money: true, sort: false }, { key: 'debit', label: 'عليه', money: true, sort: false }, { key: 'running', label: 'الصافي', money: true, sort: false }]} />}
    </Section>
  </>
}

// ═════════ السيارة ═════════
function VehicleDetail({ row }) {
  const d = useLoad(async () => {
    const [logs, trips, exps] = await Promise.all([
      backend.list('vehicle_logs', { filters: [['vehicle_id', 'eq', row.id]], order: 'log_date' }),
      backend.list('trips', { filters: [['vehicle_id', 'eq', row.id]], order: 'trip_date', limit: 300 }),
      backend.list('expenses', { filters: [['vehicle_id', 'eq', row.id], ['status', 'eq', 'approved']], order: 'exp_date' }),
    ])
    return { logs, trips, exps }
  }, [row.id])
  if (d.loading) return <Spinner />
  if (d.error) return <ErrorBox error={d.error} />
  const { logs, trips, exps } = d.data
  const fuel = logs.filter((l) => l.kind === 'fuel')
  const liters = fuel.reduce((s, l) => s + n(l.liters), 0)
  const logCost = logs.reduce((s, l) => s + n(l.cost), 0), expCost = exps.reduce((s, e) => s + n(e.amount), 0)
  const tripFuel = trips.filter((t) => t.status === 'approved').reduce((s, t) => s + n(t.fuel), 0)
  const kms = logs.map((l) => n(l.odometer)).filter(Boolean)
  const dist = kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0
  return <>
    <div className="stats">
      <Stat label="تكاليف التشغيل (سجلات + مصروفات)" value={money(logCost + expCost + tripFuel)} icon="coins" tone="amber" />
      <Stat label="استهلاك الوقود" value={liters ? num(liters) + ' لتر' : '—'} sub={dist && liters ? `${num(dist / liters)} كم/لتر` : ''} icon="truck" />
      <Stat label="عدد الرحلات" value={num(trips.length)} icon="route" tone="green" />
      <Stat label="العداد" value={num(row.odometer) + ' كم'} icon="clock" tone="gray" />
    </div>
    <Section title="سجل الصيانة والوقود والتراخيص" actions={<Btn size="sm" icon="plus" onClick={() => go('/m/vehicle_logs/new', { vehicle_id: row.id })}>إضافة سجل</Btn>}>
      <DataTable dense rows={[...logs].reverse()} onRow={(r) => go('/m/vehicle_logs/' + r.id)} columns={[{ key: 'log_date', label: 'التاريخ', value: (r) => fmtDate(r.log_date) }, { key: 'kind', label: 'النوع', value: (r) => label('vehicle_log', r.kind) }, { key: 'odometer', label: 'العداد', num: true }, { key: 'liters', label: 'لترات', num: true }, { key: 'cost', label: 'التكلفة', money: true }, { key: 'next_due_date', label: 'الموعد الجاي', value: (r) => fmtDate(r.next_due_date) }, { key: 'notes', label: 'ملاحظات' }]} />
    </Section>
    <Section title="آخر الرحلات">
      <DataTable dense rows={[...trips].reverse().slice(0, 50)} onRow={(r) => go('/m/trips/' + r.id)} columns={[{ key: 'trip_date', label: 'التاريخ', value: (r) => fmtDate(r.trip_date) }, { key: 'no', label: 'الرقم' }, { key: 'r', label: 'المسار', value: (r) => `${r.from_place || ''} ← ${r.to_place || ''}` }, { key: 'fare', label: 'النقلة', money: true }, { key: 'fuel', label: 'السولار', money: true }, { key: 'status', label: 'الحالة', render: (r) => <Badge value={r.status} /> }]} />
    </Section>
  </>
}

// ═════════ الماكينة ═════════
function MachineDetail({ row }) {
  const d = useLoad(() => backend.list('machine_logs', { filters: [['machine_id', 'eq', row.id]], order: 'log_date' }), [row.id])
  const st = useLoad(() => backend.list('wo_stages', { filters: [['machine_id', 'eq', row.id]], order: 'started_at', limit: 500 }), [row.id])
  const logs = d.data || []
  const hours = (st.data || []).reduce((s, x) => s + (x.started_at && x.ended_at ? Math.max(0, (new Date(x.ended_at) - new Date(x.started_at)) / 36e5) : 0), 0)
  return <>
    <div className="stats">
      <Stat label="تكلفة الصيانة" value={money(logs.reduce((s, l) => s + n(l.cost), 0))} icon="wrench" tone="amber" />
      <Stat label="ساعات التوقف" value={num(logs.reduce((s, l) => s + n(l.downtime_hours), 0))} icon="clock" tone="red" />
      <Stat label="عدد الأعطال" value={num(logs.filter((l) => l.kind === 'breakdown').length)} icon="alert" tone="gray" />
      <Stat label="ساعات التشغيل المسجلة" value={num(hours)} icon="gear" tone="green" />
    </div>
    <Section title="سجل الصيانة والأعطال" actions={<Btn size="sm" icon="plus" onClick={() => go('/m/machine_logs/new', { machine_id: row.id })}>تسجيل صيانة / عطل</Btn>}>
      {d.loading ? <Spinner /> : <DataTable dense rows={[...logs].reverse()} onRow={(r) => go('/m/machine_logs/' + r.id)} columns={[{ key: 'log_date', label: 'التاريخ', value: (r) => fmtDate(r.log_date) }, { key: 'kind', label: 'النوع', value: (r) => label('machine_log', r.kind) }, { key: 'description', label: 'الوصف' }, { key: 'parts_used', label: 'قطع الغيار' }, { key: 'cost', label: 'التكلفة', money: true }, { key: 'downtime_hours', label: 'توقف (ساعة)', num: true }, { key: 'technician', label: 'الفني' }]} />}
    </Section>
  </>
}

// ═════════ الخزينة ═════════
function CashboxDetail({ row }) {
  const [from, to] = [monthStart(), today()]
  const led = useLoad(() => backend.list('v_cash_ledger', { filters: [['cashbox_id', 'eq', row.id]] }), [row.id])
  const rows = useMemo(() => withRunning(led.data || [], 'amount_in', 'amount_out'), [led.data])
  const bal = rows.length ? rows[rows.length - 1].running : 0
  const todayRows = rows.filter((r) => r.entry_date === today())
  return <>
    <div className="stats">
      <Stat label="الرصيد الحالي" value={money(bal)} icon="safe" tone={bal < 0 ? 'red' : 'green'} />
      <Stat label="وارد النهارده" value={money(todayRows.reduce((s, r) => s + n(r.amount_in), 0))} icon="down" />
      <Stat label="منصرف النهارده" value={money(todayRows.reduce((s, r) => s + n(r.amount_out), 0))} icon="up" tone="amber" />
    </div>
    <Section title="حركة الخزينة" actions={<Btn size="sm" icon="print" onClick={() => go('/reports', { r: 'cash_daily', cashbox: row.id, from, to })}>يومية الخزينة</Btn>}>
      {led.loading ? <Spinner /> : <DataTable dense rows={[...rows].reverse()} rowKey="doc_id" columns={[{ key: 'entry_date', label: 'التاريخ', value: (r) => fmtDate(r.entry_date), sort: false }, { key: 'doc', label: 'المستند', render: (r) => docLink(r.doc_type, r.doc_id, r.doc_no), sort: false }, { key: 'description', label: 'البيان', sort: false }, { key: 'amount_in', label: 'وارد', money: true, sort: false }, { key: 'amount_out', label: 'منصرف', money: true, sort: false }, { key: 'running', label: 'الرصيد', money: true, sort: false }]} />}
    </Section>
  </>
}

// ═════════ الموظف ═════════
function EmployeeDetail({ row }) {
  const [from, to] = [monthStart(), today()]
  const d = useLoad(async () => {
    const [att, tx] = await Promise.all([
      backend.list('attendance', { filters: [['employee_id', 'eq', row.id], ['att_date', 'gte', from], ['att_date', 'lte', to]], order: 'att_date' }),
      backend.list('employee_transactions', { filters: [['employee_id', 'eq', row.id]], order: 'tx_date' }),
    ])
    return { att, tx }
  }, [row.id])
  if (d.loading) return <Spinner />
  if (d.error) return <ErrorBox error={d.error} />
  const { att, tx } = d.data
  const mtx = tx.filter((t) => t.tx_date >= from && t.tx_date <= to)
  const sum = (k) => mtx.filter((t) => t.kind === k).reduce((s, t) => s + n(t.amount), 0)
  const otHours = att.reduce((s, a) => s + n(a.overtime_hours), 0)
  const otValue = otHours * n(row.hour_rate)
  const net = n(row.salary) + sum('overtime') + otValue + sum('bonus') - sum('advance') - sum('deduction')
  return <>
    <div className="stats">
      <Stat label="أيام الحضور الشهر ده" value={num(att.filter((a) => ['present', 'late', 'mission'].includes(a.status)).length)} icon="clock" sub={`غياب ${att.filter((a) => a.status === 'absent').length} — إجازة ${att.filter((a) => a.status === 'leave').length}`} />
      <Stat label="ساعات الإضافي" value={num(otHours)} icon="plus" tone="green" sub={otValue ? `قيمتها ${money(otValue)}` : ''} />
      <Stat label="السلف والخصومات" value={money(sum('advance') + sum('deduction'))} icon="wallet" tone="amber" />
      <Stat label="صافي المستحق التقريبي" value={money(net)} icon="cash" tone="blue" sub="الراتب + الإضافي + المكافآت − السلف − الخصومات" />
    </div>
    <div className="card"><div className="quick">
      <Btn icon="wallet" onClick={() => go('/m/employee_transactions/new', { employee_id: row.id, kind: 'advance' })}>سلفة / خصم / إضافي</Btn>
      <Btn icon="clock" onClick={() => go('/m/attendance/new', { employee_id: row.id })}>تسجيل حضور</Btn>
    </div></div>
    <Section title="حركات الموظف">
      <DataTable dense rows={[...tx].reverse()} onRow={(r) => go('/m/employee_transactions/' + r.id)} columns={[{ key: 'tx_date', label: 'التاريخ', value: (r) => fmtDate(r.tx_date) }, { key: 'kind', label: 'النوع', value: (r) => label('emp_tx', r.kind) }, { key: 'amount', label: 'المبلغ', money: true }, { key: 'days', label: 'أيام', num: true }, { key: 'notes', label: 'ملاحظات' }]} />
    </Section>
  </>
}

export const DETAILS = { item: ItemDetail, party: PartyDetail, wo: WoDetail, driver: DriverDetail, vehicle: VehicleDetail, machine: MachineDetail, cashbox: CashboxDetail, employee: EmployeeDetail }
