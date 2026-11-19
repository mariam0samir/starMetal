// صفحات العرض: أرصدة المخزون، تتبع الخامة، تكلفة الإنتاج، أرصدة العملاء والموردين، كشف الحضور
import { useEffect, useMemo, useState } from 'react'
import { backend } from '../lib/backend'
import { useLoad, useAuth, useRefMap, useRef_, useRoute, useToast, errMsg, go, Link } from '../lib/app'
import { today, fmtDate, num, money, n, label, OPTIONS } from '../lib/format'
import { PageHead, Spinner, ErrorBox, DataTable, Stat, Btn, Select, RefSelect, Tabs, Badge, Empty } from '../ui/kit'
import { downloadXlsx } from '../lib/xlsx'
import { openPrint, companyHeader, table as ptable } from '../lib/print'
import { docLink, DOC_NAME } from './details'
import Icon from '../ui/Icon'

// ═════════ أرصدة المخزون ═════════
export function StockBalance() {
  const { query } = useRoute()
  const { settings } = useAuth()
  const whs = useRefMap('warehouses')
  const mats = useRefMap('material_types')
  const items = useRefMap('items')
  const [view, setView] = useState('items')
  const [kind, setKind] = useState(query.kind || '')
  const [wh, setWh] = useState(null)
  const [q, setQ] = useState('')
  const [low, setLow] = useState(false)
  const itemStock = useLoad(() => backend.list('v_item_stock'), [])
  const bal = useLoad(() => backend.list('v_stock_balance'), [])
  const rowsItems = useMemo(() => (itemStock.data || []).filter((r) => (!kind || r.kind === kind) && (!low || r.is_low) && (!q || (r.name + r.code).toLowerCase().includes(q.toLowerCase()))), [itemStock.data, kind, q, low])
  const rowsWh = useMemo(() => (bal.data || []).filter((r) => (!wh || r.warehouse_id === wh) && (!kind || items[r.item_id]?.kind === kind) && (!q || ((items[r.item_id]?.name || '') + (items[r.item_id]?.code || '') + (r.batch_no || '')).toLowerCase().includes(q.toLowerCase()))), [bal.data, wh, kind, q, items])
  const byWh = useMemo(() => Object.values((bal.data || []).reduce((a, r) => { const k = r.warehouse_id; a[k] = a[k] || { warehouse_id: k, items: new Set(), qty: 0, value: 0 }; a[k].items.add(r.item_id); a[k].qty += n(r.qty); a[k].value += n(r.value); return a }, {})).map((x) => ({ ...x, items: x.items.size })), [bal.data])
  const totalValue = rowsItems.reduce((s, r) => s + n(r.value), 0)
  const colsI = [
    { key: 'code', label: 'الكود' }, { key: 'name', label: 'الصنف', render: (r) => <Link to={'/m/items/' + r.item_id}>{r.name}</Link>, sortValue: (r) => r.name },
    { key: 'kind', label: 'النوع', value: (r) => label('item_kind', r.kind) }, { key: 'mt', label: 'الخامة', value: (r) => mats[r.material_type_id]?.name || '—' },
    { key: 'total_in', label: 'إجمالي الوارد', num: true }, { key: 'total_out', label: 'إجمالي المنصرف', num: true },
    { key: 'qty', label: 'الرصيد الحالي', num: true, render: (r) => <b className={r.is_low ? 'neg' : ''}>{num(r.qty, 3)}</b>, sortValue: (r) => n(r.qty) },
    { key: 'unit', label: 'الوحدة', value: (r) => label('unit', r.unit) }, { key: 'avg_cost', label: 'متوسط التكلفة', money: true }, { key: 'value', label: 'القيمة', money: true },
    { key: 'reorder_level', label: 'حد الطلب', num: true }, { key: 'last_move', label: 'آخر حركة', value: (r) => fmtDate(r.last_move), sortValue: (r) => r.last_move || '' },
  ]
  const colsW = [
    { key: 'w', label: 'المخزن', value: (r) => whs[r.warehouse_id]?.name }, { key: 'code', label: 'الكود', value: (r) => items[r.item_id]?.code },
    { key: 'i', label: 'الصنف', value: (r) => items[r.item_id]?.name, render: (r) => <Link to={'/m/items/' + r.item_id}>{items[r.item_id]?.name}</Link>, sortValue: (r) => items[r.item_id]?.name },
    { key: 'batch_no', label: 'التشغيلة', value: (r) => r.batch_no, render: (r) => r.batch_no ? <Link to="/trace" query={{ batch: r.batch_no }}>{r.batch_no}</Link> : '—' },
    { key: 'qty', label: 'الرصيد', num: true, d: 3 }, { key: 'value', label: 'القيمة', money: true }, { key: 'last_move', label: 'آخر حركة', value: (r) => fmtDate(r.last_move) },
  ]
  const exportX = () => downloadXlsx('أرصدة المخزون ' + today(), [
    { name: 'رصيد الأصناف', title: 'الرصيد الحالي لكل صنف — ' + fmtDate(today()), columns: colsI.map((c) => ({ key: c.key, label: c.label, type: c.num ? 'num' : c.money ? 'money' : 'text', value: (r) => (c.num || c.money ? r[c.key] : c.value ? c.value(r) : r[c.key]) })), rows: rowsItems, totals: { value: totalValue } },
    { name: 'حسب المخزن والتشغيلة', title: 'الأرصدة حسب المخزن والتشغيلة', columns: colsW.map((c) => ({ key: c.key, label: c.label, type: c.num ? 'num' : c.money ? 'money' : 'text', value: (r) => (c.num || c.money ? r[c.key] : c.value ? c.value(r) : r[c.key]) })), rows: rowsWh, totals: { qty: rowsWh.reduce((s, r) => s + n(r.qty), 0), value: rowsWh.reduce((s, r) => s + n(r.value), 0) } },
  ])
  const print = () => openPrint('أرصدة المخزون', companyHeader(settings.company, 'تقرير الرصيد الحالي', '', fmtDate(today())) + ptable(colsI.map((c) => ({ label: c.label, num: c.num || c.money, value: (r) => (c.money ? money(r[c.key]) : c.num ? num(r[c.key], 3) : c.value ? c.value(r) : r[c.key]) })), rowsItems, { __label: 'إجمالي القيمة', value: money(totalValue) }))
  return (
    <div className="page">
      <PageHead title="أرصدة المخزون" sub="الرصيد الحالي لأي صنف في أي مخزن، بالتشغيلة" icon="chart">
        <Btn icon="excel" onClick={exportX}>Excel</Btn><Btn icon="print" onClick={print}>طباعة / PDF</Btn>
        <Btn kind="primary" icon="plus" onClick={() => go('/m/stock_docs/new', { kind: 'count' })}>جرد فعلي</Btn>
      </PageHead>
      <div className="stats">
        {byWh.map((w) => <Stat key={w.warehouse_id} label={whs[w.warehouse_id]?.name || 'مخزن'} value={money(w.value)} sub={`${w.items} صنف — ${num(w.qty)} وحدة`} icon="warehouse" tone={{ raw: 'blue', wip: 'purple', finished: 'green', scrap: 'amber', spares: 'gray' }[whs[w.warehouse_id]?.kind] || 'gray'} onClick={() => { setView('wh'); setWh(w.warehouse_id) }} />)}
      </div>
      <Tabs tabs={[['items', 'رصيد كل صنف'], ['wh', 'حسب المخزن والتشغيلة']]} value={view} onChange={setView} />
      <div className="filters card">
        <div className="f-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الكود أو التشغيلة…" /></div>
        <label className="f-l">النوع <Select opt="item_kind" value={kind} onChange={setKind} placeholder="الكل" /></label>
        {view === 'wh' && <label className="f-l">المخزن <RefSelect table="warehouses" value={wh} onChange={setWh} placeholder="كل المخازن" /></label>}
        {view === 'items' && <label className="chk"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> <span>تحت حد الطلب بس</span></label>}
      </div>
      <div className="card pad0">
        {(view === 'items' ? itemStock : bal).loading ? <Spinner /> : (view === 'items' ? itemStock : bal).error ? <ErrorBox error={(view === 'items' ? itemStock : bal).error} />
          : view === 'items' ? <DataTable rows={rowsItems} rowKey="item_id" columns={colsI} foot={{ __label: `${rowsItems.length} صنف`, value: totalValue }} />
          : <DataTable rows={rowsWh} rowKey={null} columns={colsW} foot={{ __label: `${rowsWh.length} سطر`, value: rowsWh.reduce((s, r) => s + n(r.value), 0), qty: rowsWh.reduce((s, r) => s + n(r.qty), 0) }} />}
      </div>
    </div>
  )
}

// ═════════ تتبع الخامة من الدخول للمنتج النهائي ═════════
export function Trace() {
  const { query } = useRoute()
  const [batch, setBatch] = useState(query.batch || '')
  const [run, setRun] = useState(query.batch || '')
  const items = useRefMap('items')
  const whs = useRefMap('warehouses')
  const parties = useRefMap('parties')
  useEffect(() => { if (query.batch) { setBatch(query.batch); setRun(query.batch) } }, [query.batch])
  const t = useLoad(async () => {
    if (!run) return null
    const moves = await backend.list('stock_moves', { filters: [['batch_no', 'eq', run]], order: 'created_at', asc: true })
    const woIds = [...new Set(moves.filter((m) => m.work_order_id && m.qty < 0).map((m) => m.work_order_id))]
    const wos = woIds.length ? await backend.list('v_wo_cost', { filters: [['wo_id', 'in', woIds]] }) : []
    const outMoves = woIds.length ? await backend.list('stock_moves', { filters: [['work_order_id', 'in', woIds], ['qty', 'gt', 0]], order: 'created_at', asc: true }) : []
    const outBatches = [...new Set(outMoves.map((m) => m.batch_no).filter(Boolean))]
    const after = outBatches.length ? await backend.list('stock_moves', { filters: [['batch_no', 'in', outBatches], ['qty', 'lt', 0]], order: 'created_at', asc: true }) : []
    return { moves, wos, outMoves, after }
  }, [run])
  const d = t.data
  const receipt = d?.moves.find((m) => m.qty > 0 && (m.doc_type === 'gate_in' || m.doc_type === 'stock_docs'))
  const recvQty = d ? d.moves.filter((m) => m.qty > 0 && m.reason !== 'تحويل').reduce((s, m) => s + n(m.qty), 0) : 0
  const issued = d ? d.moves.filter((m) => m.qty < 0 && m.work_order_id).reduce((s, m) => s - n(m.qty), 0) : 0
  const bal = d ? d.moves.reduce((s, m) => s + n(m.qty), 0) : 0
  const step = (icon, title, body, tone = '') => <div className={`tr-step ${tone}`}><span className="tr-ic"><Icon name={icon} /></span><div><b>{title}</b>{body}</div></div>
  return (
    <div className="page">
      <PageHead title="تتبع الخامة" sub="اكتب رقم التشغيلة (أو امسح الباركود) وشوف رحلتها: دخلت إمتى — اتصرفت لأي أمر — طلع منها إيه — راحت لمين" icon="trace" />
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); setRun(batch.trim()); go('/trace', { batch: batch.trim() }) }}>
        <div className="f-search"><input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="رقم التشغيلة — مثلًا GI-2026-00012" autoFocus /></div>
        <Btn kind="primary" type="submit" icon="search">تتبع</Btn>
      </form>
      {!run ? <Empty icon="trace" text="رقم التشغيلة بيتعمل أوتوماتيك مع كل إذن دخول خامات، وبيتطبع على ملصق الباركود" />
        : t.loading ? <Spinner /> : t.error ? <ErrorBox error={t.error} /> : !d.moves.length ? <Empty text={`مفيش حركات للتشغيلة «${run}»`} /> : (
        <div className="trace">
          {step('truck-in', 'الاستلام', <p>{receipt ? <>{fmtDate(receipt.move_date)} — {docLink(receipt.doc_type, receipt.doc_id, receipt.doc_no)} — {items[receipt.item_id]?.name} — <b>{num(recvQty, 3)}</b> {receipt.party_id && <>من {parties[receipt.party_id]?.name}</>}</> : 'التشغيلة دي ناتج إنتاج'}</p>, 'blue')}
          {step('warehouse', 'المخزن', <p>{[...new Set(d.moves.map((m) => whs[m.warehouse_id]?.name))].join(' ← ')} — الرصيد الباقي <b>{num(bal, 3)}</b></p>)}
          {step('truck-out', 'الصرف لأوامر التشغيل', d.wos.length ? <ul>{d.moves.filter((m) => m.qty < 0 && m.work_order_id).map((m) => <li key={m.id}>{fmtDate(m.move_date)} — صرف <b>{num(-m.qty, 3)}</b> لأمر <Link to={'/m/work_orders/' + m.work_order_id}>{d.wos.find((w) => w.wo_id === m.work_order_id)?.no}</Link> ({docLink(m.doc_type, m.doc_id, m.doc_no)})</li>)}</ul> : <p className="muted">لسه متصرفش لأي أمر تشغيل</p>, 'amber')}
          {d.wos.map((w) => <div key={w.wo_id}>{step('gear', `أمر التشغيل ${w.no}`, <p>منتج <b>{num(w.produced_qty, 3)}</b> — هالك <b>{num(w.scrap_qty, 3)}</b> كجم ({num(w.scrap_pct)}%) — التكلفة {money(w.total_cost)} — <Badge value={w.status} opt="wo_status" /></p>, 'purple')}</div>)}
          {d.outMoves.length > 0 && step('box', 'المنتج النهائي والخردة', <ul>{d.outMoves.map((m) => <li key={m.id}>{fmtDate(m.move_date)} — {items[m.item_id]?.name} <b>{num(m.qty, 3)}</b> في {whs[m.warehouse_id]?.name} — تشغيلة <Link to="/trace" query={{ batch: m.batch_no }}>{m.batch_no}</Link></li>)}</ul>, 'green')}
          {d.after.length > 0 && step('users', 'البيع والتسليم', <ul>{d.after.map((m) => <li key={m.id}>{fmtDate(m.move_date)} — {DOC_NAME[m.doc_type]} {docLink(m.doc_type, m.doc_id, m.doc_no)} — <b>{num(-m.qty, 3)}</b> {m.party_id && <>لـ {parties[m.party_id]?.name}</>}</li>)}</ul>, 'teal')}
          <div className="card pad0"><h3 className="card-t px">كل حركات التشغيلة</h3>
            <DataTable dense rows={d.moves} columns={[{ key: 'move_date', label: 'التاريخ', value: (r) => fmtDate(r.move_date) }, { key: 'doc', label: 'المستند', render: (r) => docLink(r.doc_type, r.doc_id, r.doc_no) }, { key: 'reason', label: 'البيان' }, { key: 'i', label: 'الصنف', value: (r) => items[r.item_id]?.name }, { key: 'w', label: 'المخزن', value: (r) => whs[r.warehouse_id]?.name }, { key: 'qty', label: 'الكمية', num: true, d: 3 }]} /></div>
          <p className="muted">إجمالي المستلم {num(recvQty, 3)} — المصروف للتشغيل {num(issued, 3)} — الباقي {num(bal, 3)}</p>
        </div>
      )}
    </div>
  )
}

// ═════════ تكلفة الإنتاج لكل أوامر التشغيل ═════════
export function Costing() {
  const { settings } = useAuth()
  const parties = useRefMap('parties')
  const items = useRefMap('items')
  const [st, setSt] = useState('')
  const d = useLoad(() => backend.list('v_wo_cost', { order: 'start_date' }), [])
  const rows = (d.data || []).filter((r) => !st || r.status === st)
  const cols = [
    { key: 'no', label: 'أمر التشغيل', render: (r) => <Link to={'/m/work_orders/' + r.wo_id}>{r.no}</Link>, sortValue: (r) => r.no },
    { key: 'c', label: 'العميل', value: (r) => parties[r.customer_id]?.name }, { key: 'p', label: 'المنتج', value: (r) => items[r.product_item_id]?.name },
    { key: 'status', label: 'الحالة', render: (r) => <Badge value={r.status} opt="wo_status" />, sortValue: (r) => r.status },
    { key: 'issued_qty', label: 'خام مصروف', num: true }, { key: 'produced_qty', label: 'منتج', num: true }, { key: 'scrap_qty', label: 'هالك', num: true }, { key: 'scrap_pct', label: 'نسبة الهالك %', num: true },
    { key: 'material_cost', label: 'تكلفة الخامات', money: true }, { key: 'total_cost', label: 'إجمالي التكلفة', money: true },
    { key: 'unit', label: 'تكلفة الوحدة', money: true, value: (r) => (n(r.produced_qty) ? n(r.total_cost) / n(r.produced_qty) : null) },
    { key: 'sale_value', label: 'سعر البيع', money: true }, { key: 'profit', label: 'الربح', money: true, value: (r) => n(r.sale_value) - n(r.total_cost), render: (r) => <b className={n(r.sale_value) - n(r.total_cost) < 0 ? 'neg' : 'pos'}>{money(n(r.sale_value) - n(r.total_cost))}</b> },
    { key: 'margin', label: 'الهامش %', num: true, value: (r) => (n(r.sale_value) ? (n(r.sale_value) - n(r.total_cost)) / n(r.sale_value) * 100 : null) },
  ]
  const tot = { __label: 'الإجمالي', material_cost: rows.reduce((s, r) => s + n(r.material_cost), 0), total_cost: rows.reduce((s, r) => s + n(r.total_cost), 0), sale_value: rows.reduce((s, r) => s + n(r.sale_value), 0), issued_qty: rows.reduce((s, r) => s + n(r.issued_qty), 0), produced_qty: rows.reduce((s, r) => s + n(r.produced_qty), 0), scrap_qty: rows.reduce((s, r) => s + n(r.scrap_qty), 0) }
  tot.profit = tot.sale_value - tot.total_cost
  const xl = () => downloadXlsx('تكلفة وربحية أوامر التشغيل', [{ name: 'التكلفة', title: 'تكلفة وربحية أوامر التشغيل', columns: cols.map((c) => ({ key: c.key, label: c.label, type: c.money ? 'money' : c.num ? 'num' : 'text', value: (r) => (c.value ? c.value(r) : c.key === 'no' ? r.no : c.key === 'status' ? label('wo_status', r.status) : r[c.key]) })), rows, totals: tot }])
  return (
    <div className="page">
      <PageHead title="تكلفة الإنتاج والربحية" sub="تكلفة كل أمر تشغيل = الخامات + العمالة + الماكينات + الطاقة + النقل + المصروفات المباشرة − قيمة الخردة" icon="calc">
        <Btn icon="excel" onClick={xl} disabled={!rows.length}>Excel</Btn>
        <Btn icon="print" onClick={() => openPrint('تكلفة الإنتاج', companyHeader(settings.company, 'تكلفة وربحية أوامر التشغيل', '', fmtDate(today())) + ptable(cols.map((c) => ({ label: c.label, num: c.num || c.money, value: (r) => { const v = c.value ? c.value(r) : r[c.key]; return c.money ? money(v) : c.num ? num(v) : c.key === 'no' ? r.no : c.key === 'status' ? label('wo_status', r.status) : v } })), rows))}>طباعة / PDF</Btn>
      </PageHead>
      <div className="stats">
        <Stat label="إجمالي تكلفة الإنتاج" value={money(tot.total_cost)} icon="calc" />
        <Stat label="إجمالي سعر البيع" value={money(tot.sale_value)} icon="receipt" tone="green" />
        <Stat label="الربح الإجمالي" value={money(tot.profit)} icon="coins" tone={tot.profit < 0 ? 'red' : 'teal'} sub={tot.sale_value ? `هامش ${num(tot.profit / tot.sale_value * 100)}%` : ''} />
        <Stat label="متوسط نسبة الهالك" value={num(tot.issued_qty ? tot.scrap_qty / tot.issued_qty * 100 : 0) + '%'} icon="recycle" tone="amber" />
      </div>
      <div className="filters card"><label className="f-l">الحالة <Select opt="wo_status" value={st} onChange={setSt} placeholder="الكل" /></label></div>
      <div className="card pad0">{d.loading ? <Spinner /> : d.error ? <ErrorBox error={d.error} /> : <DataTable rows={rows} rowKey="wo_id" columns={cols} foot={tot} />}</div>
    </div>
  )
}

// ═════════ أرصدة العملاء والموردين والسائقين ═════════
export function Balances() {
  const { query } = useRoute()
  const { settings } = useAuth()
  const [tab, setTab] = useState(query.tab || 'customers')
  const [hideZero, setHideZero] = useState(true)
  const p = useLoad(() => backend.list('v_party_balances'), [])
  const rows = (p.data || []).filter((r) => (tab === 'customers' ? ['customer', 'both', 'scrap_buyer'].includes(r.kind) : ['supplier', 'both'].includes(r.kind)) && (!hideZero || Math.abs(n(r.balance)) > 0.009))
  const tot = rows.reduce((s, r) => s + n(r.balance), 0)
  const cols = [
    { key: 'code', label: 'الكود' }, { key: 'name', label: 'الاسم', render: (r) => <Link to={`/m/${tab}/${r.party_id}`}>{r.name}</Link>, sortValue: (r) => r.name }, { key: 'phone', label: 'الهاتف' },
    { key: 'total_debit', label: tab === 'customers' ? 'إجمالي الفواتير' : 'إجمالي المدفوع', money: true, value: (r) => (tab === 'customers' ? r.total_debit : r.total_debit) },
    { key: 'total_credit', label: tab === 'customers' ? 'إجمالي المحصّل' : 'إجمالي الفواتير', money: true },
    { key: 'balance', label: tab === 'customers' ? 'المديونية (عليه)' : 'المستحق له', money: true, value: (r) => (tab === 'customers' ? n(r.balance) : -n(r.balance)), render: (r) => { const v = tab === 'customers' ? n(r.balance) : -n(r.balance); return <b className={v > 0 ? 'neg' : 'pos'}>{money(v)}</b> } },
    { key: 'credit_limit', label: 'حد الائتمان', money: true, render: (r) => (n(r.credit_limit) ? <span className={n(r.balance) > n(r.credit_limit) ? 'neg' : ''}>{money(r.credit_limit)}</span> : '—') },
    { key: 'last_date', label: 'آخر تعامل', value: (r) => fmtDate(r.last_date), sortValue: (r) => r.last_date || '' },
  ]
  const shownTot = tab === 'customers' ? tot : -tot
  return (
    <div className="page">
      <PageHead title="أرصدة العملاء والموردين" icon="scale">
        <Btn icon="excel" onClick={() => downloadXlsx('أرصدة ' + (tab === 'customers' ? 'العملاء' : 'الموردين'), [{ name: 'الأرصدة', title: 'أرصدة ' + (tab === 'customers' ? 'العملاء' : 'الموردين') + ' — ' + fmtDate(today()), columns: cols.map((c) => ({ key: c.key, label: c.label, type: c.money ? 'money' : 'text', value: (r) => (c.value ? c.value(r) : r[c.key]) })), rows, totals: { balance: shownTot } }])}>Excel</Btn>
        <Btn icon="print" onClick={() => openPrint('الأرصدة', companyHeader(settings.company, 'أرصدة ' + (tab === 'customers' ? 'العملاء' : 'الموردين'), '', fmtDate(today())) + ptable(cols.map((c) => ({ label: c.label, num: c.money, value: (r) => { const v = c.value ? c.value(r) : r[c.key]; return c.money ? money(v) : v } })), rows, { __label: 'الإجمالي', balance: money(shownTot) }))}>طباعة / PDF</Btn>
      </PageHead>
      <Tabs tabs={[['customers', 'العملاء'], ['suppliers', 'الموردين']]} value={tab} onChange={setTab} />
      <div className="stats">
        <Stat label={tab === 'customers' ? 'إجمالي مديونيات العملاء' : 'إجمالي المستحق للموردين'} value={money(shownTot)} icon="scale" tone={tab === 'customers' ? 'blue' : 'red'} />
        <Stat label="عدد الحسابات المفتوحة" value={num(rows.length)} icon="users" tone="gray" />
      </div>
      <div className="filters card"><label className="chk"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /><span>إخفاء الحسابات الخالصة</span></label></div>
      <div className="card pad0">{p.loading ? <Spinner /> : p.error ? <ErrorBox error={p.error} /> : <DataTable rows={rows} rowKey="party_id" columns={cols} foot={{ __label: 'الإجمالي', balance: shownTot }} />}</div>
    </div>
  )
}

// ═════════ كشف حضور اليوم لكل الموظفين ═════════
export function AttendanceSheet() {
  const toast = useToast()
  const emps = useRef_('employees').filter((e) => e.active !== false)
  const [date, setDate] = useState(today())
  const [rows, setRows] = useState({})
  const [busy, setBusy] = useState(false)
  const ex = useLoad(() => backend.list('attendance', { filters: [['att_date', 'eq', date]] }), [date])
  useEffect(() => { setRows(Object.fromEntries((ex.data || []).map((a) => [a.employee_id, a]))) }, [ex.data])
  const set = (id, k, v) => setRows((r) => ({ ...r, [id]: { ...(r[id] || { status: 'present' }), [k]: v } }))
  const all = (status) => setRows((r) => Object.fromEntries(emps.map((e) => [e.id, { ...(r[e.id] || {}), status, check_in: status === 'present' ? r[e.id]?.check_in || '08:00' : r[e.id]?.check_in }])))
  const save = async () => {
    setBusy(true)
    try {
      const list = emps.filter((e) => rows[e.id]?.status).map((e) => ({ employee_id: e.id, att_date: date, status: rows[e.id].status, check_in: rows[e.id].check_in || null, check_out: rows[e.id].check_out || null, overtime_hours: rows[e.id].overtime_hours ? Number(rows[e.id].overtime_hours) : 0, notes: rows[e.id].notes || null }))
      await backend.upsert('attendance', list, 'employee_id,att_date')
      toast(`اتسجل حضور ${list.length} موظف ✓`); ex.reload()
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  return (
    <div className="page">
      <PageHead title="كشف الحضور والانصراف" sub="سجّل حضور كل الموظفين مرة واحدة" icon="clock">
        <Btn onClick={() => all('present')}>الكل حاضر</Btn><Btn kind="primary" icon="check" busy={busy} onClick={save}>حفظ الكشف</Btn>
      </PageHead>
      <div className="filters card"><label className="f-l">اليوم <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><span className="muted">{emps.length} موظف</span></div>
      <div className="card pad0">
        {ex.loading ? <Spinner /> : !emps.length ? <Empty text="ضيف الموظفين الأول من «الموظفين والعمال»" /> : (
          <div className="table-wrap"><table className="dt lines-t">
            <thead><tr><th>الموظف</th><th>القسم</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th><th>إضافي (ساعة)</th><th>ملاحظات</th></tr></thead>
            <tbody>{emps.map((e) => { const r = rows[e.id] || {}; return (
              <tr key={e.id}><td><b>{e.name}</b></td><td className="muted">{e.department}</td>
                <td><Select opt="att_status" value={r.status} onChange={(v) => set(e.id, 'status', v)} placeholder="—" /></td>
                <td><input type="time" value={r.check_in ? String(r.check_in).slice(0, 5) : ''} onChange={(x) => set(e.id, 'check_in', x.target.value)} /></td>
                <td><input type="time" value={r.check_out ? String(r.check_out).slice(0, 5) : ''} onChange={(x) => set(e.id, 'check_out', x.target.value)} /></td>
                <td><input type="number" step="0.5" value={r.overtime_hours ?? ''} onChange={(x) => set(e.id, 'overtime_hours', x.target.value)} /></td>
                <td><input value={r.notes ?? ''} onChange={(x) => set(e.id, 'notes', x.target.value)} /></td></tr>) })}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
