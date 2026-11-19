import { useMemo } from 'react'
import { backend } from '../lib/backend'
import { useLoad, useAuth, useRefMap, go, Link } from '../lib/app'
import { today, monthStart, addDays, addMonths, fmtDate, fmtDateTime, num, money, n, MONTHS, label } from '../lib/format'
import { Stat, Spinner, ErrorBox, BarChart, Donut, DataTable, Badge, fmtShort } from '../ui/kit'
import Icon from '../ui/Icon'
import { docLink } from './details'
import { pnlData } from '../lib/reports'

const safe = (p) => p.catch(() => [])

export default function Dashboard() {
  const { profile, settings } = useAuth()
  const whs = useRefMap('warehouses')
  const items = useRefMap('items')
  const t = today(), ms = monthStart(), since = addMonths(t, -5)
  const { data, loading, error, reload } = useLoad(async () => {
    const [moves, stock, wos, sinv, cash, exps, parties, boxes, drivers, alerts, last, pnl] = await Promise.all([
      safe(backend.list('stock_moves', { filters: [['move_date', 'gte', since]], select: 'move_date,qty,doc_type,item_id,warehouse_id,unit_cost,reason' })),
      safe(backend.list('v_item_stock')),
      safe(backend.list('v_wo_cost', { filters: [['status', 'neq', 'cancelled']] })),
      safe(backend.list('sales_invoices', { filters: [['inv_date', 'gte', since], ['status', 'eq', 'approved']], select: 'inv_date,total' })),
      safe(backend.list('cash_transactions', { filters: [['tx_date', 'gte', since], ['status', 'eq', 'approved']], select: 'tx_date,kind,amount,party_type' })),
      safe(backend.list('expenses', { filters: [['exp_date', 'gte', since], ['status', 'eq', 'approved']], select: 'exp_date,amount,category' })),
      safe(backend.list('v_party_balances')),
      safe(backend.list('v_cash_balances')),
      safe(backend.list('v_driver_dues')),
      safe(backend.list('v_alerts')),
      safe(backend.list('stock_moves', { order: 'created_at', limit: 10 })),
      pnlData(monthStart(), today()).catch(() => null),
    ])
    return { moves, stock, wos, sinv, cash, exps, parties, boxes, drivers, alerts, last, pnl }
  }, [])

  const k = useMemo(() => {
    if (!data) return null
    const { moves, stock, wos, sinv, cash, exps, parties, boxes, drivers } = data
    const sumMoves = (pred) => moves.filter(pred).reduce((s, m) => s + Math.abs(n(m.qty)), 0)
    const inToday = sumMoves((m) => m.doc_type === 'gate_in' && m.move_date === t)
    const inMonth = sumMoves((m) => m.doc_type === 'gate_in' && m.move_date >= ms)
    const outToday = sumMoves((m) => m.doc_type === 'gate_out' && m.move_date === t)
    const outMonth = sumMoves((m) => m.doc_type === 'gate_out' && m.move_date >= ms)
    const prodToday = sumMoves((m) => m.reason === 'استلام إنتاج' && m.move_date === t)
    const prodMonth = sumMoves((m) => m.reason === 'استلام إنتاج' && m.move_date >= ms)
    const raw = stock.filter((s) => s.kind === 'raw')
    const open = wos.filter((w) => !['completed', 'delivered', 'cancelled'].includes(w.status))
    const doneMonth = wos.filter((w) => ['completed', 'delivered'].includes(w.status))
    const late = wos.filter((w) => w.is_late)
    const salesMonth = sinv.filter((x) => x.inv_date >= ms).reduce((s, x) => s + n(x.total), 0)
    const collMonth = cash.filter((x) => x.tx_date >= ms && x.kind === 'receipt' && x.party_type === 'customer').reduce((s, x) => s + n(x.amount), 0)
    const expMonth = exps.filter((x) => x.exp_date >= ms).reduce((s, x) => s + n(x.amount), 0)
    const recv = parties.filter((p) => n(p.balance) > 0).reduce((s, p) => s + n(p.balance), 0)
    const pay = parties.filter((p) => n(p.balance) < 0).reduce((s, p) => s - n(p.balance), 0)
    const cashBal = boxes.reduce((s, b) => s + n(b.balance), 0)
    const driverDue = drivers.reduce((s, d) => s + Math.max(0, n(d.net_due)), 0)
    // آخر 6 شهور
    const months = []
    for (let i = 5; i >= 0; i--) months.push(addMonths(t, -i).slice(0, 7))
    const byMonth = months.map((mo) => ({
      label: MONTHS[Number(mo.slice(5, 7)) - 1],
      sales: sinv.filter((x) => x.inv_date?.startsWith(mo)).reduce((s, x) => s + n(x.total), 0),
      coll: cash.filter((x) => x.tx_date?.startsWith(mo) && x.kind === 'receipt' && x.party_type === 'customer').reduce((s, x) => s + n(x.amount), 0),
      exp: exps.filter((x) => x.exp_date?.startsWith(mo)).reduce((s, x) => s + n(x.amount), 0),
    }))
    const days = []
    for (let i = 13; i >= 0; i--) days.push(addDays(t, -i))
    const byDay = days.map((d) => ({
      label: d.slice(8, 10) + '/' + d.slice(5, 7),
      prod: sumMoves((m) => m.reason === 'استلام إنتاج' && m.move_date === d),
      inn: sumMoves((m) => m.doc_type === 'gate_in' && m.move_date === d),
      out: sumMoves((m) => m.doc_type === 'gate_out' && m.move_date === d),
    }))
    const expCats = Object.entries(exps.filter((x) => x.exp_date >= ms).reduce((a, x) => { a[x.category] = (a[x.category] || 0) + n(x.amount); return a }, {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value }))
    const wipQty = open.reduce((s, w) => s + Math.max(0, n(w.issued_qty) - n(w.scrap_qty)), 0)
    return {
      inToday, inMonth, outToday, outMonth, prodToday, prodMonth, open, doneMonth, late, salesMonth, collMonth, expMonth, recv, pay, cashBal, driverDue, byMonth, byDay, expCats,
      rawQty: raw.reduce((s, x) => s + n(x.qty), 0), rawValue: raw.reduce((s, x) => s + n(x.value), 0), stockValue: stock.reduce((s, x) => s + n(x.value), 0),
      low: stock.filter((s) => s.is_low), wipQty,
      top: [...stock].filter((s) => n(s.qty) > 0).sort((a, b) => n(b.value) - n(a.value)).slice(0, 8),
    }
  }, [data, whs]) // eslint-disable-line

  if (loading) return <div className="page"><Spinner /></div>
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>
  const hour = new Date().getHours()
  return (
    <div className="page dash">
      <div className="hello">
        <div><h1>{hour < 12 ? 'صباح الخير' : 'مساء الخير'}، {profile?.full_name?.split(' ')[0] || ''} 👋</h1><p>{settings.company?.name || 'المصنع'} — {fmtDate(t)}</p></div>
        <div className="hello-a">
          <button className="qa" onClick={() => go('/m/gate_in/new')}><Icon name="truck-in" />دخول خامات</button>
          <button className="qa" onClick={() => go('/m/work_orders/new')}><Icon name="gear" />أمر تشغيل</button>
          <button className="qa" onClick={() => go('/m/gate_out/new')}><Icon name="truck-out" />إذن خروج</button>
          <button className="qa" onClick={() => go('/m/sales_invoices/new')}><Icon name="receipt" />فاتورة</button>
          <button className="qa" onClick={() => go('/m/cash_transactions/new', { kind: 'receipt', party_type: 'customer' })}><Icon name="cash" />تحصيل</button>
        </div>
      </div>

      <div className="stats s4">
        <Stat label="خامات في المخزن" value={num(k.rawQty)} sub={`قيمتها ${money(k.rawValue)} — كل المخزون ${money(k.stockValue)}`} icon="layers" onClick={() => go('/stock', { kind: 'raw' })} />
        <Stat label="خامات داخلة" value={num(k.inToday)} sub={`النهارده — الشهر ${num(k.inMonth)}`} icon="truck-in" tone="green" onClick={() => go('/m/gate_in')} />
        <Stat label="منتجات خارجة" value={num(k.outToday)} sub={`النهارده — الشهر ${num(k.outMonth)}`} icon="truck-out" tone="amber" onClick={() => go('/m/gate_out')} />
        <Stat label="الإنتاج" value={num(k.prodToday)} sub={`النهارده — الشهر ${num(k.prodMonth)}`} icon="box" tone="purple" />
        <Stat label="كميات تحت التشغيل" value={num(k.wipQty)} sub="خامات مصروفة لأوامر مفتوحة" icon="steps" tone="blue" onClick={() => go('/costing')} />
        <Stat label="أوامر تشغيل مفتوحة" value={num(k.open.length)} sub={`${k.late.length} متأخر`} icon="gear" tone={k.late.length ? 'red' : 'blue'} onClick={() => go('/m/work_orders')} />
        <Stat label="مبيعات الشهر" value={money(k.salesMonth)} sub={`تحصيل ${money(k.collMonth)}`} icon="receipt" tone="green" onClick={() => go('/m/sales_invoices')} />
        {data.pnl ? <Stat label={data.pnl.net >= 0 ? 'صافي ربح الشهر' : 'صافي خسارة الشهر'} value={money(Math.abs(data.pnl.net))} sub={`مجمل الربح ${money(data.pnl.gross)} — المصروفات ${money(k.expMonth)}`} icon="coins" tone={data.pnl.net >= 0 ? 'green' : 'red'} onClick={() => go('/reports', { r: 'pnl' })} />
          : <Stat label="مصروفات الشهر" value={money(k.expMonth)} icon="bill" tone="amber" onClick={() => go('/m/expenses')} />}
        <Stat label="رصيد الخزائن" value={money(k.cashBal)} icon="safe" tone={k.cashBal < 0 ? 'red' : 'teal'} onClick={() => go('/m/cashboxes')} />
        <Stat label="مستحق لينا عند العملاء" value={money(k.recv)} icon="users" tone="blue" onClick={() => go('/balances')} />
        <Stat label="مستحق علينا للموردين" value={money(k.pay)} icon="truck-in" tone="red" onClick={() => go('/balances', { tab: 'suppliers' })} />
        <Stat label="مستحقات السائقين" value={money(k.driverDue)} icon="driver" tone="amber" onClick={() => go('/reports', { r: 'drivers' })} />
      </div>

      <div className="grid2">
        <div className="card"><h3 className="card-t">الإنتاج والمنتجات الخارجة — آخر 14 يوم</h3>
          <BarChart data={k.byDay} series={[['prod', 'الإنتاج', '#c8161d'], ['out', 'منتجات خارجة', '#4a5563']]} /></div>
        <div className="card"><h3 className="card-t">المبيعات والتحصيل والمصروفات — آخر 6 شهور</h3>
          <BarChart data={k.byMonth} fmt={money} series={[['sales', 'المبيعات', '#c8161d'], ['coll', 'التحصيل', '#2a313c'], ['exp', 'المصروفات', '#a3aab5']]} /></div>
      </div>

      <div className="grid3">
        <div className="card"><h3 className="card-t">التنبيهات <span className="count">{data.alerts.length}</span></h3>
          <div className="al-list">{!data.alerts.length && <p className="muted">كله تمام — مفيش تنبيهات 👌</p>}
            {data.alerts.slice(0, 12).map((a, i) => <div key={i} className={`al ${a.level}`}><Icon name="alert" size={15} /><span>{a.title}{a.due_date && <small>{fmtDate(a.due_date)}</small>}</span></div>)}</div></div>
        <div className="card"><h3 className="card-t">أوامر التشغيل المتأخرة</h3>
          {!k.late.length ? <p className="muted">مفيش أوامر متأخرة</p> : <ul className="mini">{k.late.slice(0, 8).map((w) => <li key={w.wo_id}><Link to={'/m/work_orders/' + w.wo_id}>{w.no}</Link><Badge value={w.status} opt="wo_status" /><small>التسليم {fmtDate(w.due_date)}</small></li>)}</ul>}
          <h3 className="card-t mt">أصناف تحت حد الطلب</h3>
          {!k.low.length ? <p className="muted">كل الأصناف فوق حد الطلب</p> : <ul className="mini">{k.low.slice(0, 8).map((s) => <li key={s.item_id}><Link to={'/m/items/' + s.item_id}>{s.name}</Link><b className="neg">{num(s.qty)}</b><small>الحد {num(s.reorder_level)}</small></li>)}</ul>}</div>
        <div className="card"><h3 className="card-t">المصروفات حسب البند (الشهر)</h3>{k.expCats.length ? <Donut data={k.expCats} fmt={money} /> : <p className="muted">مفيش مصروفات الشهر ده</p>}</div>
      </div>

      <div className="grid2">
        <div className="card pad0"><h3 className="card-t px">أعلى الأصناف قيمة في المخزن</h3>
          <DataTable dense rows={k.top} rowKey="item_id" onRow={(r) => go('/m/items/' + r.item_id)} columns={[{ key: 'name', label: 'الصنف' }, { key: 'kind', label: 'النوع', value: (r) => label('item_kind', r.kind) }, { key: 'qty', label: 'الرصيد', num: true }, { key: 'value', label: 'القيمة', money: true }]} /></div>
        <div className="card pad0"><h3 className="card-t px">آخر حركات المخزن</h3>
          <DataTable dense rows={data.last} columns={[{ key: 't', label: 'الوقت', value: (r) => fmtDateTime(r.created_at) }, { key: 'doc', label: 'المستند', render: (r) => docLink(r.doc_type, r.doc_id, r.doc_no) }, { key: 'i', label: 'الصنف', value: (r) => items[r.item_id]?.name }, { key: 'w', label: 'المخزن', value: (r) => whs[r.warehouse_id]?.name }, { key: 'qty', label: 'الكمية', num: true, render: (r) => <b className={r.qty < 0 ? 'neg' : 'pos'}>{num(r.qty)}</b> }]} /></div>
      </div>
    </div>
  )
}
export { fmtShort }
