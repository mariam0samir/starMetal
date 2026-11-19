// محرّك التقارير: كل تقرير بيرجع { title, columns, rows, totals, kpis }
import { backend } from './backend'
import { fmtDate, num, money, n, label, addDays, MONTHS } from './format'

const T = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra })
const inRange = (col, from, to) => [[col, 'gte', from], [col, 'lte', col.endsWith('_at') ? to + 'T23:59:59' : to]]
const sum = (rows, k) => rows.reduce((s, r) => s + n(typeof k === 'function' ? k(r) : r[k]), 0)
const groupBy = (rows, keyFn) => rows.reduce((a, r) => { const k = keyFn(r); (a[k] = a[k] || []).push(r); return a }, {})
const daysOf = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out }

// الجداول المرجعية بتتجاب مرة واحدة للتقارير
export async function loadRefs() {
  const [items, warehouses, parties, drivers, vehicles, cashboxes, machines, employees, material_types, work_orders] = await Promise.all(
    ['items', 'warehouses', 'parties', 'drivers', 'vehicles', 'cashboxes', 'machines', 'employees', 'material_types', 'work_orders'].map((t) => backend.list(t).catch(() => [])))
  const map = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))
  return { items: map(items), warehouses: map(warehouses), parties: map(parties), drivers: map(drivers), vehicles: map(vehicles), cashboxes: map(cashboxes), machines: map(machines), employees: map(employees), material_types: map(material_types), work_orders: map(work_orders), lists: { items, warehouses, parties, drivers, vehicles, cashboxes, machines, employees } }
}

export const REPORT_GROUPS = [
  ['المخازن', ['stock_moves', 'stock_balance', 'low_stock', 'top_consumed', 'in_out']],
  ['الإنتاج', ['production_daily', 'production_monthly', 'work_orders', 'wo_cost', 'wo_profit', 'scrap', 'qc', 'machines']],
  ['المبيعات والمشتريات', ['sales', 'purchases', 'customers', 'suppliers']],
  ['الأرباح والخسائر', ['annual', 'pnl', 'pnl_monthly', 'wo_profit']],
  ['الحسابات', ['expenses', 'treasury', 'cash_daily']],
  ['النقل والموظفين', ['vehicles', 'drivers', 'attendance']],
  ['النظام', ['system_overview', 'monthly_summary', 'drafts', 'activity']],
]

// params: { from, to, warehouse, party, item, driver, cashbox, vehicle }
export const REPORTS = {
  stock_moves: {
    title: 'تقرير حركة المخزون', perm: 'stock', params: ['warehouse', 'item'],
    async run({ from, to, warehouse, item }, R) {
      const f = inRange('move_date', from, to)
      if (warehouse) f.push(['warehouse_id', 'eq', warehouse])
      if (item) f.push(['item_id', 'eq', item])
      const rows = await backend.list('stock_moves', { filters: f, order: 'created_at', asc: true })
      return {
        columns: [T('move_date', 'التاريخ', 'date'), T('doc_no', 'المستند'), T('reason', 'البيان'), T('item', 'الصنف', 'text', { value: (r) => R.items[r.item_id]?.name }), T('wh', 'المخزن', 'text', { value: (r) => R.warehouses[r.warehouse_id]?.name }), T('batch_no', 'التشغيلة'),
          T('in', 'وارد', 'num', { value: (r) => (r.qty > 0 ? n(r.qty) : null) }), T('out', 'منصرف', 'num', { value: (r) => (r.qty < 0 ? -n(r.qty) : null) }), T('unit_cost', 'التكلفة', 'money'), T('val', 'القيمة', 'money', { value: (r) => Math.abs(n(r.qty)) * n(r.unit_cost) })],
        rows, totals: { in: sum(rows.filter((r) => r.qty > 0), 'qty'), out: -sum(rows.filter((r) => r.qty < 0), 'qty') },
        kpis: [['عدد الحركات', num(rows.length)], ['إجمالي الوارد', num(sum(rows.filter((r) => r.qty > 0), 'qty'))], ['إجمالي المنصرف', num(-sum(rows.filter((r) => r.qty < 0), 'qty'))]],
      }
    },
  },
  stock_balance: {
    title: 'تقرير الرصيد الحالي', perm: 'stock', noDate: true, params: ['warehouse'],
    async run({ warehouse }, R) {
      if (warehouse) {
        const rows = await backend.list('v_stock_balance', { filters: [['warehouse_id', 'eq', warehouse]] })
        return { columns: [T('code', 'الكود', 'text', { value: (r) => R.items[r.item_id]?.code }), T('item', 'الصنف', 'text', { value: (r) => R.items[r.item_id]?.name }), T('batch_no', 'التشغيلة'), T('qty', 'الرصيد', 'num'), T('value', 'القيمة', 'money')], rows, totals: { value: sum(rows, 'value') }, kpis: [['قيمة المخزن', money(sum(rows, 'value'))]] }
      }
      const rows = (await backend.list('v_item_stock', { order: 'code', asc: true })).filter((r) => Math.abs(n(r.qty)) > 0)
      return {
        columns: [T('code', 'الكود'), T('name', 'الصنف'), T('kind', 'النوع', 'text', { value: (r) => label('item_kind', r.kind) }), T('mt', 'الخامة', 'text', { value: (r) => R.material_types[r.material_type_id]?.name }), T('qty', 'الرصيد', 'num'), T('unit', 'الوحدة', 'text', { value: (r) => label('unit', r.unit) }), T('avg_cost', 'متوسط التكلفة', 'money'), T('value', 'القيمة', 'money')],
        rows, totals: { value: sum(rows, 'value') }, kpis: [['عدد الأصناف', num(rows.length)], ['قيمة المخزون', money(sum(rows, 'value'))]],
      }
    },
  },
  low_stock: {
    title: 'الأصناف منخفضة المخزون', perm: 'stock', noDate: true,
    async run(_, R) {
      const rows = (await backend.list('v_item_stock')).filter((r) => r.is_low)
      return { columns: [T('code', 'الكود'), T('name', 'الصنف'), T('qty', 'الرصيد', 'num'), T('reorder_level', 'حد الطلب', 'num'), T('need', 'الناقص', 'num', { value: (r) => Math.max(0, n(r.reorder_level) - n(r.qty)) }), T('sup', 'المورد', 'text', { value: (r) => R.parties[R.items[r.item_id]?.supplier_id]?.name })], rows, kpis: [['أصناف تحت الحد', num(rows.length)]] }
    },
  },
  top_consumed: {
    title: 'أكثر الأصناف استهلاكًا', perm: 'stock',
    async run({ from, to }, R) {
      const moves = await backend.list('stock_moves', { filters: [...inRange('move_date', from, to), ['qty', 'lt', 0]] })
      const g = groupBy(moves.filter((m) => m.reason !== 'تحويل'), (m) => m.item_id)
      const rows = Object.entries(g).map(([id, ms]) => ({ id, qty: -sum(ms, 'qty'), value: -sum(ms, (m) => n(m.qty) * n(m.unit_cost)), count: ms.length })).sort((a, b) => b.qty - a.qty)
      return { columns: [T('code', 'الكود', 'text', { value: (r) => R.items[r.id]?.code }), T('name', 'الصنف', 'text', { value: (r) => R.items[r.id]?.name }), T('qty', 'الكمية المستهلكة', 'num'), T('unit', 'الوحدة', 'text', { value: (r) => label('unit', R.items[r.id]?.unit) }), T('value', 'القيمة', 'money'), T('count', 'عدد الحركات', 'num')], rows, totals: { value: sum(rows, 'value') } }
    },
  },
  in_out: {
    title: 'تقرير الداخل والخارج', perm: 'gate_in',
    async run({ from, to }, R) {
      const [gi, go] = await Promise.all([
        backend.list('gate_in', { filters: inRange('entry_at', from, to), order: 'entry_at', asc: true }),
        backend.list('gate_out', { filters: inRange('exit_at', from, to), order: 'exit_at', asc: true }).catch(() => []),
      ])
      const rows = [...gi.map((d) => ({ ...d, dir: 'دخول', at: d.entry_at, party: R.parties[d.supplier_id]?.name, w: d.net_weight })), ...go.map((d) => ({ ...d, dir: 'خروج', at: d.exit_at, party: R.parties[d.customer_id]?.name, w: null, vehicle_no: d.vehicle_no || R.vehicles[d.vehicle_id]?.plate_no, driver_name: d.driver_name || R.drivers[d.driver_id]?.name }))].sort((a, b) => String(a.at).localeCompare(String(b.at)))
      return {
        columns: [T('at', 'التاريخ', 'date'), T('dir', 'الاتجاه'), T('no', 'رقم الإذن'), T('party', 'المورد / العميل'), T('vehicle_no', 'السيارة'), T('driver_name', 'السائق'), T('w', 'صافي الوزن', 'num'), T('st', 'الحالة', 'text', { value: (r) => label('status', r.status) })],
        rows, kpis: [['أذون دخول', num(gi.length)], ['صافي وزن الداخل', num(sum(gi.filter((x) => x.status === 'approved'), 'net_weight')) + ' كجم'], ['أذون خروج', num(go.length)]],
      }
    },
  },
  production_daily: {
    title: 'تقرير الإنتاج اليومي', perm: 'work_orders',
    async run({ from, to }, R) {
      const moves = (await backend.list('stock_moves', { filters: [...inRange('move_date', from, to), ['qty', 'gt', 0]] })).filter((m) => m.reason === 'استلام إنتاج')
      const g = groupBy(moves, (m) => m.move_date + '|' + m.item_id)
      const rows = Object.entries(g).map(([k, ms]) => ({ d: k.split('|')[0], id: k.split('|')[1], qty: sum(ms, 'qty'), wos: [...new Set(ms.map((m) => R.work_orders[m.work_order_id]?.no).filter(Boolean))].join('، '), value: sum(ms, (m) => n(m.qty) * n(m.unit_cost)) })).sort((a, b) => a.d.localeCompare(b.d))
      const byDay = daysOf(from, to).map((d) => ({ label: d.slice(8, 10) + '/' + d.slice(5, 7), v: sum(rows.filter((r) => r.d === d), 'qty') }))
      return { columns: [T('d', 'اليوم', 'date'), T('name', 'المنتج', 'text', { value: (r) => R.items[r.id]?.name }), T('qty', 'الكمية المنتجة', 'num'), T('unit', 'الوحدة', 'text', { value: (r) => label('unit', R.items[r.id]?.unit) }), T('value', 'تكلفة الإنتاج', 'money'), T('wos', 'أوامر التشغيل')], rows, totals: { qty: sum(rows, 'qty'), value: sum(rows, 'value') }, chart: byDay.length <= 45 ? byDay : null, kpis: [['إجمالي الإنتاج', num(sum(rows, 'qty'))], ['متوسط يومي', num(sum(rows, 'qty') / Math.max(1, daysOf(from, to).length))]] }
    },
  },
  production_monthly: {
    title: 'تقرير الإنتاج الشهري', perm: 'work_orders',
    async run({ from, to }, R) {
      const moves = (await backend.list('stock_moves', { filters: [...inRange('move_date', from, to), ['qty', 'gt', 0]] })).filter((m) => m.reason === 'استلام إنتاج')
      const g = groupBy(moves, (m) => m.move_date.slice(0, 7) + '|' + m.item_id)
      const rows = Object.entries(g).map(([k, ms]) => ({ m: k.split('|')[0], id: k.split('|')[1], qty: sum(ms, 'qty'), value: sum(ms, (x) => n(x.qty) * n(x.unit_cost)), days: new Set(ms.map((x) => x.move_date)).size })).sort((a, b) => a.m.localeCompare(b.m))
      return { columns: [T('m', 'الشهر'), T('name', 'المنتج', 'text', { value: (r) => R.items[r.id]?.name }), T('qty', 'الكمية', 'num'), T('days', 'أيام الإنتاج', 'num'), T('value', 'تكلفة الإنتاج', 'money')], rows, totals: { qty: sum(rows, 'qty'), value: sum(rows, 'value') } }
    },
  },
  work_orders: {
    title: 'تقرير أوامر التشغيل', perm: 'work_orders',
    async run({ from, to }, R) {
      const rows = await backend.list('v_wo_cost', { filters: inRange('start_date', from, to), order: 'start_date', asc: true })
      return {
        columns: [T('no', 'الرقم'), T('c', 'العميل', 'text', { value: (r) => R.parties[r.customer_id]?.name }), T('p', 'المنتج', 'text', { value: (r) => R.items[r.product_item_id]?.name }), T('start_date', 'البداية', 'date'), T('due_date', 'التسليم', 'date'), T('st', 'الحالة', 'text', { value: (r) => label('wo_status', r.status) }), T('qty_required', 'المطلوب', 'num'), T('produced_qty', 'المنتج', 'num'), T('late', 'متأخر؟', 'text', { value: (r) => (r.is_late ? 'متأخر' : '') })],
        rows, kpis: [['عدد الأوامر', num(rows.length)], ['مكتملة', num(rows.filter((r) => ['completed', 'delivered'].includes(r.status)).length)], ['مفتوحة', num(rows.filter((r) => !['completed', 'delivered', 'cancelled'].includes(r.status)).length)], ['متأخرة', num(rows.filter((r) => r.is_late).length)]],
      }
    },
  },
  wo_cost: {
    title: 'تقرير تكلفة أوامر التشغيل', perm: 'costing',
    async run({ from, to }, R) {
      const rows = await backend.list('v_wo_cost', { filters: inRange('start_date', from, to), order: 'start_date', asc: true })
      return { columns: [T('no', 'الأمر'), T('p', 'المنتج', 'text', { value: (r) => R.items[r.product_item_id]?.name }), T('material_cost', 'الخامات', 'money'), T('lab', 'عمالة وماكينات', 'money', { value: (r) => n(r.stages_labor_cost) + n(r.stages_machine_cost) }), T('manual_costs', 'تكاليف أخرى', 'money'), T('direct_expenses', 'مصروفات مباشرة', 'money'), T('scrap_value', 'قيمة الخردة', 'money'), T('total_cost', 'إجمالي التكلفة', 'money'), T('produced_qty', 'الكمية', 'num'), T('unit', 'تكلفة الوحدة', 'money', { value: (r) => (n(r.produced_qty) ? n(r.total_cost) / n(r.produced_qty) : null) })], rows, totals: { material_cost: sum(rows, 'material_cost'), total_cost: sum(rows, 'total_cost') } }
    },
  },
  wo_profit: {
    title: 'تقرير أرباح كل أمر تشغيل', perm: 'costing',
    async run({ from, to }, R) {
      const rows = (await backend.list('v_wo_cost', { filters: inRange('start_date', from, to) })).map((r) => ({ ...r, profit: n(r.sale_value) - n(r.total_cost) })).sort((a, b) => b.profit - a.profit)
      return { columns: [T('no', 'الأمر'), T('c', 'العميل', 'text', { value: (r) => R.parties[r.customer_id]?.name }), T('total_cost', 'التكلفة', 'money'), T('sale_value', 'سعر البيع', 'money'), T('profit', 'الربح', 'money'), T('margin', 'الهامش %', 'num', { value: (r) => (n(r.sale_value) ? r.profit / n(r.sale_value) * 100 : null) })], rows, totals: { total_cost: sum(rows, 'total_cost'), sale_value: sum(rows, 'sale_value'), profit: sum(rows, 'profit') }, kpis: [['إجمالي الربح', money(sum(rows, 'profit'))], ['أوامر خسرانة', num(rows.filter((r) => r.profit < 0 && n(r.sale_value)).length)]] }
    },
  },
  scrap: {
    title: 'تقرير الهالك والخردة', perm: 'scrap',
    async run({ from, to }, R) {
      const [rows, sales] = await Promise.all([backend.list('scrap_records', { filters: [...inRange('rec_date', from, to), ['status', 'eq', 'approved']], order: 'rec_date', asc: true }), backend.list('scrap_sales', { filters: [...inRange('sale_date', from, to), ['status', 'eq', 'approved']] })])
      return {
        columns: [T('rec_date', 'التاريخ', 'date'), T('no', 'الرقم'), T('scrap_type', 'النوع'), T('src', 'المصدر', 'text', { value: (r) => label('scrap_source', r.source) }), T('wo', 'أمر التشغيل', 'text', { value: (r) => R.work_orders[r.wo_id]?.no }), T('mc', 'الماكينة', 'text', { value: (r) => R.machines[r.machine_id]?.name }), T('weight', 'الوزن (كجم)', 'num'), T('est_value', 'القيمة', 'money')],
        rows, totals: { weight: sum(rows, 'weight'), est_value: sum(rows, 'est_value') },
        kpis: [['وزن الهالك', num(sum(rows, 'weight')) + ' كجم'], ['قيمته التقديرية', money(sum(rows, 'est_value'))], ['مبيعات الخردة', money(sum(sales, 'total'))]],
      }
    },
  },
  qc: {
    title: 'تقرير الجودة', perm: 'quality',
    async run({ from, to }, R) {
      const rows = await backend.list('qc_inspections', { filters: inRange('insp_date', from, to), order: 'insp_date', asc: true })
      const ins = sum(rows, 'qty_inspected'), rej = sum(rows, 'qty_rejected')
      return { columns: [T('insp_date', 'التاريخ', 'date'), T('no', 'الرقم'), T('wo', 'أمر التشغيل', 'text', { value: (r) => R.work_orders[r.wo_id]?.no }), T('item', 'الصنف', 'text', { value: (r) => R.items[r.item_id]?.name }), T('qty_inspected', 'المفحوص', 'num'), T('qty_accepted', 'المقبول', 'num'), T('qty_rejected', 'المرفوض', 'num'), T('reject_reason', 'سبب الرفض'), T('dec', 'القرار', 'text', { value: (r) => label('qc_decision', r.decision) })], rows, totals: { qty_inspected: ins, qty_accepted: sum(rows, 'qty_accepted'), qty_rejected: rej }, kpis: [['نسبة الرفض', num(ins ? rej / ins * 100 : 0) + '%']] }
    },
  },
  machines: {
    title: 'تقرير صيانة الماكينات', perm: 'machines',
    async run({ from, to }, R) {
      const logs = await backend.list('machine_logs', { filters: inRange('log_date', from, to) })
      const rows = Object.entries(groupBy(logs, (l) => l.machine_id)).map(([id, ls]) => ({ id, count: ls.length, breakdowns: ls.filter((l) => l.kind === 'breakdown').length, cost: sum(ls, 'cost'), down: sum(ls, 'downtime_hours') }))
      return { columns: [T('name', 'الماكينة', 'text', { value: (r) => R.machines[r.id]?.name }), T('count', 'عدد السجلات', 'num'), T('breakdowns', 'الأعطال', 'num'), T('down', 'ساعات التوقف', 'num'), T('cost', 'تكلفة الصيانة', 'money'), T('next', 'الصيانة الجاية', 'date', { value: (r) => R.machines[r.id]?.next_maintenance_date })], rows, totals: { cost: sum(rows, 'cost'), down: sum(rows, 'down') } }
    },
  },
  sales: {
    title: 'تقرير المبيعات', perm: 'sales', params: ['party'],
    async run({ from, to, party }, R) {
      const f = [...inRange('inv_date', from, to), ['status', 'eq', 'approved']]
      if (party) f.push(['customer_id', 'eq', party])
      const rows = await backend.list('sales_invoices', { filters: f, order: 'inv_date', asc: true })
      return { columns: [T('inv_date', 'التاريخ', 'date'), T('no', 'رقم الفاتورة'), T('c', 'العميل', 'text', { value: (r) => R.parties[r.customer_id]?.name }), T('subtotal', 'قبل الضريبة', 'money'), T('discount', 'الخصم', 'money'), T('tax_amount', 'الضريبة', 'money'), T('total', 'الإجمالي', 'money'), T('due_date', 'الاستحقاق', 'date')], rows, totals: { subtotal: sum(rows, 'subtotal'), tax_amount: sum(rows, 'tax_amount'), total: sum(rows, 'total') }, kpis: [['عدد الفواتير', num(rows.length)], ['إجمالي المبيعات', money(sum(rows, 'total'))]] }
    },
  },
  purchases: {
    title: 'تقرير المشتريات', perm: 'purchasing', params: ['party'],
    async run({ from, to, party }, R) {
      const f = [...inRange('inv_date', from, to), ['status', 'eq', 'approved']]
      if (party) f.push(['supplier_id', 'eq', party])
      const rows = await backend.list('supplier_invoices', { filters: f, order: 'inv_date', asc: true })
      return { columns: [T('inv_date', 'التاريخ', 'date'), T('no', 'الرقم'), T('supplier_ref', 'فاتورة المورد'), T('s', 'المورد', 'text', { value: (r) => R.parties[r.supplier_id]?.name }), T('subtotal', 'قبل الضريبة', 'money'), T('transport_cost', 'النقل', 'money'), T('tax_amount', 'الضريبة', 'money'), T('total', 'الإجمالي', 'money'), T('due_date', 'الاستحقاق', 'date')], rows, totals: { subtotal: sum(rows, 'subtotal'), total: sum(rows, 'total') }, kpis: [['إجمالي المشتريات', money(sum(rows, 'total'))]] }
    },
  },
  customers: {
    title: 'تقرير العملاء', perm: 'parties',
    async run({ from, to }, R) { return partyReport('customer', from, to, R) },
  },
  suppliers: {
    title: 'تقرير الموردين', perm: 'parties',
    async run({ from, to }, R) { return partyReport('supplier', from, to, R) },
  },
  expenses: {
    title: 'تقرير المصروفات', perm: 'expenses',
    async run({ from, to }, R) {
      const rows = await backend.list('expenses', { filters: [...inRange('exp_date', from, to), ['status', 'eq', 'approved']], order: 'exp_date', asc: true })
      const cats = Object.entries(groupBy(rows, (r) => r.category)).map(([c, rs]) => ({ c, v: sum(rs, 'amount') })).sort((a, b) => b.v - a.v)
      return {
        columns: [T('exp_date', 'التاريخ', 'date'), T('no', 'الرقم'), T('category', 'البند'), T('description', 'البيان'), T('cb', 'الخزينة', 'text', { value: (r) => R.cashboxes[r.cashbox_id]?.name }), T('ref', 'مرتبط بـ', 'text', { value: (r) => R.vehicles[r.vehicle_id]?.plate_no || R.machines[r.machine_id]?.name || R.work_orders[r.wo_id]?.no || '' }), T('amount', 'المبلغ', 'money')],
        rows, totals: { amount: sum(rows, 'amount') }, kpis: [['إجمالي المصروفات', money(sum(rows, 'amount'))], ...cats.slice(0, 3).map((c) => [c.c, money(c.v)])],
        extra: { title: 'المصروفات حسب البند', columns: [T('c', 'البند'), T('v', 'الإجمالي', 'money'), T('p', 'النسبة %', 'num', { value: (r) => (sum(rows, 'amount') ? r.v / sum(rows, 'amount') * 100 : 0) })], rows: cats },
      }
    },
  },
  treasury: {
    title: 'تقرير الخزينة', perm: 'treasury', params: ['cashbox'],
    async run({ from, to, cashbox }, R) {
      const all = await backend.list('v_cash_ledger', cashbox ? { filters: [['cashbox_id', 'eq', cashbox]] } : {})
      const before = all.filter((r) => !r.entry_date || r.entry_date < from)
      const rows = all.filter((r) => r.entry_date && r.entry_date >= from && r.entry_date <= to).sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      const open = sum(before, (r) => n(r.amount_in) - n(r.amount_out))
      let bal = open
      const rr = rows.map((r) => { bal += n(r.amount_in) - n(r.amount_out); return { ...r, running: bal } })
      return {
        columns: [T('entry_date', 'التاريخ', 'date'), T('doc_no', 'المستند'), T('description', 'البيان'), T('cb', 'الخزينة', 'text', { value: (r) => R.cashboxes[r.cashbox_id]?.name }), T('amount_in', 'وارد', 'money'), T('amount_out', 'منصرف', 'money'), T('running', 'الرصيد', 'money')],
        rows: [{ entry_date: from, description: 'رصيد أول الفترة', running: open }, ...rr], totals: { amount_in: sum(rows, 'amount_in'), amount_out: sum(rows, 'amount_out'), running: bal },
        kpis: [['رصيد أول الفترة', money(open)], ['إجمالي الوارد', money(sum(rows, 'amount_in'))], ['إجمالي المنصرف', money(sum(rows, 'amount_out'))], ['رصيد آخر الفترة', money(bal)]],
      }
    },
  },
  cash_daily: {
    title: 'يومية الخزينة', perm: 'treasury', params: ['cashbox'], singleDay: true,
    async run(p, R) { const r = await REPORTS.treasury.run({ ...p, to: p.from }, R); return { ...r, title: 'يومية الخزينة ' + fmtDate(p.from) } },
  },
  vehicles: {
    title: 'تقرير السيارات', perm: 'vehicles', params: ['vehicle'],
    async run({ from, to, vehicle }, R) {
      const [logs, trips, exps] = await Promise.all([
        backend.list('vehicle_logs', { filters: inRange('log_date', from, to) }), backend.list('trips', { filters: [...inRange('trip_date', from, to), ['status', 'eq', 'approved']] }).catch(() => []),
        backend.list('expenses', { filters: [...inRange('exp_date', from, to), ['status', 'eq', 'approved'], ['vehicle_id', 'not_null']] }).catch(() => []),
      ])
      const ids = vehicle ? [vehicle] : Object.keys(R.vehicles)
      const rows = ids.map((id) => {
        const l = logs.filter((x) => x.vehicle_id === id), t = trips.filter((x) => x.vehicle_id === id), e = exps.filter((x) => x.vehicle_id === id)
        return { id, trips: t.length, fare: sum(t, 'fare'), fuel: sum(l.filter((x) => x.kind === 'fuel'), 'cost') + sum(t, 'fuel'), liters: sum(l, 'liters'), maint: sum(l.filter((x) => x.kind !== 'fuel'), 'cost'), exp: sum(e, 'amount'), km: sum(t, 'distance_km') }
      }).map((r) => ({ ...r, cost: r.fuel + r.maint + r.exp }))
      return { columns: [T('p', 'السيارة', 'text', { value: (r) => R.vehicles[r.id]?.plate_no }), T('d', 'السائق', 'text', { value: (r) => R.drivers[R.vehicles[r.id]?.driver_id]?.name }), T('trips', 'الرحلات', 'num'), T('km', 'الكيلومترات', 'num'), T('fare', 'إيراد النقلات', 'money'), T('liters', 'لترات', 'num'), T('fuel', 'الوقود', 'money'), T('maint', 'الصيانة', 'money'), T('exp', 'مصروفات أخرى', 'money'), T('cost', 'إجمالي التكلفة', 'money'), T('lic', 'انتهاء الترخيص', 'date', { value: (r) => R.vehicles[r.id]?.license_expiry })], rows, totals: { trips: sum(rows, 'trips'), fare: sum(rows, 'fare'), fuel: sum(rows, 'fuel'), maint: sum(rows, 'maint'), cost: sum(rows, 'cost') } }
    },
  },
  drivers: {
    title: 'تقرير السائقين', perm: 'drivers', params: ['driver'],
    async run({ from, to, driver }, R) {
      const [led, dues] = await Promise.all([backend.list('v_driver_ledger'), backend.list('v_driver_dues')])
      const ids = driver ? [driver] : Object.keys(R.drivers)
      const rows = ids.map((id) => {
        const l = led.filter((x) => x.driver_id === id && x.entry_date && x.entry_date >= from && x.entry_date <= to)
        const trips = l.filter((x) => x.doc_type === 'trips' && n(x.credit))
        return { id, trips: trips.length, fare: sum(trips, 'credit'), exp: sum(l.filter((x) => x.doc_type === 'trips' && /مصروفات/.test(x.description)), 'debit'), adv: sum(l.filter((x) => /سلفة/.test(x.description)), 'debit'), ded: sum(l.filter((x) => /خصم/.test(x.description)), 'debit'), paid: sum(l.filter((x) => x.doc_type === 'cash_transactions'), 'debit'), net_period: sum(l, (x) => n(x.credit) - n(x.debit)), due: n(dues.find((d) => d.driver_id === id)?.net_due) }
      })
      return { columns: [T('n', 'السائق', 'text', { value: (r) => R.drivers[r.id]?.name }), T('trips', 'الرحلات', 'num'), T('fare', 'إجمالي النقلات', 'money'), T('exp', 'المصروفات', 'money'), T('adv', 'السلف', 'money'), T('ded', 'الخصومات', 'money'), T('paid', 'المصروف له', 'money'), T('net_period', 'صافي الفترة', 'money'), T('due', 'المستحق الحالي', 'money')], rows, totals: { trips: sum(rows, 'trips'), fare: sum(rows, 'fare'), due: sum(rows, 'due') }, kpis: [['إجمالي مستحقات السائقين', money(sum(rows, 'due'))]] }
    },
  },
  attendance: {
    title: 'تقرير الحضور والانصراف', perm: 'employees',
    async run({ from, to }, R) {
      const [att, tx] = await Promise.all([backend.list('attendance', { filters: inRange('att_date', from, to) }), backend.list('employee_transactions', { filters: inRange('tx_date', from, to) })])
      const rows = Object.values(R.employees).filter((e) => e.active !== false).map((e) => {
        const a = att.filter((x) => x.employee_id === e.id), t = tx.filter((x) => x.employee_id === e.id)
        const s = (k) => sum(t.filter((x) => x.kind === k), 'amount')
        return { e, present: a.filter((x) => ['present', 'late', 'mission'].includes(x.status)).length, late: a.filter((x) => x.status === 'late').length, absent: a.filter((x) => x.status === 'absent').length, leave: a.filter((x) => x.status === 'leave').length, ot: sum(a, 'overtime_hours'), adv: s('advance'), ded: s('deduction'), bonus: s('bonus') + s('overtime') }
      })
      return { columns: [T('n', 'الموظف', 'text', { value: (r) => r.e.name }), T('d', 'القسم', 'text', { value: (r) => r.e.department }), T('present', 'حضور', 'num'), T('late', 'تأخير', 'num'), T('absent', 'غياب', 'num'), T('leave', 'إجازة', 'num'), T('ot', 'ساعات إضافي', 'num'), T('bonus', 'مكافآت وإضافي', 'money'), T('adv', 'سلف', 'money'), T('ded', 'خصومات', 'money'), T('sal', 'الراتب', 'money', { value: (r) => r.e.salary })], rows }
    },
  },
}


// ═════════ تقارير النظام ═════════
const DOC_TABLES = [['gate_in', 'أذون الدخول', 'entry_at'], ['gate_out', 'أذون الخروج', 'exit_at'], ['stock_docs', 'أذون المخزن', 'doc_date'], ['scrap_records', 'تسجيلات الهالك', 'rec_date'], ['scrap_sales', 'مبيعات الخردة', 'sale_date'], ['qc_inspections', 'فحوصات الجودة', 'insp_date'], ['purchase_requests', 'طلبات الشراء', 'req_date'], ['purchase_orders', 'أوامر الشراء', 'po_date'], ['supplier_invoices', 'فواتير الموردين', 'inv_date'], ['sales_orders', 'أوامر البيع', 'so_date'], ['sales_invoices', 'فواتير المبيعات', 'inv_date'], ['cash_transactions', 'حركات الخزينة', 'tx_date'], ['expenses', 'المصروفات', 'exp_date'], ['trips', 'الرحلات', 'trip_date']]
const safeList = (t, o) => backend.list(t, o).catch(() => [])

REPORTS.system_overview = {
  title: 'تقرير النظام الشامل', perm: 'reports',
  async run({ from, to }, R) {
    const [profiles, stock, parties, boxes, dues, alerts, wos, moves, audit, ...docs] = await Promise.all([
      safeList('profiles'), safeList('v_item_stock'), safeList('v_party_balances'), safeList('v_cash_balances'), safeList('v_driver_dues'), safeList('v_alerts'), safeList('v_wo_cost'),
      safeList('stock_moves', { filters: inRange('move_date', from, to), select: 'id,qty,reason,doc_type' }), safeList('audit_log', { filters: [['at', 'gte', from], ['at', 'lte', to + 'T23:59:59']], select: 'id,action,user_name,table_name', limit: 20000 }),
      ...DOC_TABLES.map(([t, , d]) => safeList(t, { filters: inRange(d, from, to), select: 'id,status' + (['sales_invoices', 'supplier_invoices', 'scrap_sales'].includes(t) ? ',total' : t === 'expenses' || t === 'cash_transactions' ? ',amount' + (t === 'cash_transactions' ? ',kind' : '') : '') })),
    ])
    const rows = []
    const add = (section, metric, value) => rows.push({ section, metric, value })
    const L = R.lists
    add('النظام', 'المستخدمين المفعّلين', num(profiles.filter((p) => p.active).length))
    add('النظام', 'مستخدمين مستنيين تفعيل', num(profiles.filter((p) => !p.active).length))
    add('النظام', 'العمليات المسجلة في الفترة', num(audit.length))
    add('البيانات الأساسية', 'الأصناف', `${num(L.items.length)} (خامات ${L.items.filter((i) => i.kind === 'raw').length} — منتج نهائي ${L.items.filter((i) => i.kind === 'finished').length})`)
    add('البيانات الأساسية', 'أنواع الخامات', num(Object.keys(R.material_types).length))
    add('البيانات الأساسية', 'المخازن', num(L.warehouses.length))
    add('البيانات الأساسية', 'العملاء', num(L.parties.filter((p) => ['customer', 'both', 'scrap_buyer'].includes(p.kind)).length))
    add('البيانات الأساسية', 'الموردين', num(L.parties.filter((p) => ['supplier', 'both'].includes(p.kind)).length))
    add('البيانات الأساسية', 'الماكينات / الموظفين', `${num(L.machines.length)} / ${num(L.employees.length)}`)
    add('البيانات الأساسية', 'السيارات / السائقين', `${num(L.vehicles.length)} / ${num(L.drivers.length)}`)
    add('المخزون', 'قيمة المخزون الحالية', money(sum(stock, 'value')))
    add('المخزون', 'أصناف تحت حد الطلب', num(stock.filter((s) => s.is_low).length))
    add('المخزون', 'حركات المخزون في الفترة', num(moves.length))
    add('المخزون', 'إجمالي الوارد / المنصرف في الفترة', `${num(sum(moves.filter((m) => m.qty > 0), 'qty'))} / ${num(-sum(moves.filter((m) => m.qty < 0), 'qty'))}`)
    add('الإنتاج', 'أوامر التشغيل المفتوحة', num(wos.filter((w) => !['completed', 'delivered', 'cancelled'].includes(w.status)).length))
    add('الإنتاج', 'أوامر التشغيل المتأخرة', num(wos.filter((w) => w.is_late).length))
    add('الإنتاج', 'الإنتاج في الفترة', num(sum(moves.filter((m) => m.reason === 'استلام إنتاج'), 'qty')))
    const dt = Object.fromEntries(DOC_TABLES.map(([t], i) => [t, docs[i]]))
    const ok = (t) => dt[t].filter((x) => x.status === 'approved')
    add('المبيعات والمشتريات', 'مبيعات الفترة', money(sum(ok('sales_invoices'), 'total')))
    add('المبيعات والمشتريات', 'مشتريات الفترة', money(sum(ok('supplier_invoices'), 'total')))
    add('المبيعات والمشتريات', 'مديونيات العملاء الحالية', money(sum(parties.filter((p) => n(p.balance) > 0), 'balance')))
    add('المبيعات والمشتريات', 'المستحق للموردين حاليًا', money(-sum(parties.filter((p) => n(p.balance) < 0), 'balance')))
    add('الحسابات', 'رصيد كل الخزائن والبنوك', money(sum(boxes, 'balance')))
    add('الحسابات', 'تحصيل الفترة', money(sum(ok('cash_transactions').filter((x) => x.kind === 'receipt'), 'amount')))
    add('الحسابات', 'مصروفات الفترة', money(sum(ok('expenses'), 'amount')))
    add('النقل', 'رحلات الفترة', num(ok('trips').length))
    add('النقل', 'مستحقات السائقين الحالية', money(sum(dues.filter((d) => n(d.net_due) > 0), 'net_due')))
    add('التنبيهات', 'إجمالي التنبيهات المفتوحة', num(alerts.length))
    for (const [k, l] of Object.entries(groupBy(alerts, (a) => a.kind))) add('التنبيهات', { low_stock: 'رصيد منخفض', late_wo: 'أوامر متأخرة', vehicle_license: 'تراخيص سيارات', vehicle_insurance: 'تأمين سيارات', vehicle_service: 'صيانة سيارات', vehicle_oil: 'تغيير زيت', driver_license: 'رخص سائقين', machine_maintenance: 'صيانة ماكينات', invoice_due: 'فواتير متأخرة', cheque_due: 'شيكات مستحقة' }[k] || k, num(l.length))
    const docRows = DOC_TABLES.map(([t, l], i) => ({ l, total: docs[i].length, approved: docs[i].filter((x) => x.status === 'approved').length, draft: docs[i].filter((x) => x.status === 'draft').length, cancelled: docs[i].filter((x) => x.status === 'cancelled').length })).filter((r) => r.total)
    return {
      columns: [T('section', 'القسم'), T('metric', 'المؤشر'), T('value', 'القيمة')], rows,
      kpis: [['المستخدمين', num(profiles.filter((p) => p.active).length)], ['قيمة المخزون', money(sum(stock, 'value'))], ['مبيعات الفترة', money(sum(ok('sales_invoices'), 'total'))], ['التنبيهات', num(alerts.length)]],
      extra: { title: 'المستندات في الفترة حسب الحالة', columns: [T('l', 'المستند'), T('total', 'الإجمالي', 'num'), T('approved', 'معتمد', 'num'), T('draft', 'مسودة', 'num'), T('cancelled', 'ملغي', 'num')], rows: docRows },
    }
  },
}

REPORTS.drafts = {
  title: 'مستندات مستنية اعتماد', perm: 'reports', noDate: true,
  async run(_, R) {
    const all = await Promise.all(DOC_TABLES.map(([t, l, d]) => safeList(t, { filters: [['status', 'eq', 'draft']], order: d, asc: true }).then((rs) => rs.map((r) => ({ ...r, l, d: r[d], t })))))
    const rows = all.flat().sort((a, b) => String(a.d).localeCompare(String(b.d)))
    return { columns: [T('d', 'التاريخ', 'date'), T('l', 'نوع المستند'), T('no', 'الرقم'), T('who', 'الجهة', 'text', { value: (r) => R.parties[r.supplier_id || r.customer_id || r.party_id || r.buyer_id]?.name || R.drivers[r.driver_id]?.name || '' }), T('amt', 'المبلغ', 'money', { value: (r) => r.total ?? r.amount ?? null })], rows, kpis: [['مستندات مستنية اعتماد', num(rows.length)]] }
  },
}

REPORTS.activity = {
  title: 'نشاط المستخدمين', perm: 'audit',
  async run({ from, to }) {
    const log = await backend.list('audit_log', { filters: [['at', 'gte', from], ['at', 'lte', to + 'T23:59:59']], select: 'user_name,action,table_name,at', limit: 50000 })
    const rows = Object.entries(groupBy(log, (l) => l.user_name || 'النظام')).map(([u, ls]) => ({ u, total: ls.length, ins: ls.filter((l) => l.action === 'insert').length, upd: ls.filter((l) => l.action === 'update').length, del: ls.filter((l) => l.action === 'delete').length, last: ls.map((l) => l.at).sort().slice(-1)[0] })).sort((a, b) => b.total - a.total)
    return { columns: [T('u', 'المستخدم'), T('total', 'إجمالي العمليات', 'num'), T('ins', 'إضافة', 'num'), T('upd', 'تعديل', 'num'), T('del', 'حذف', 'num'), T('last', 'آخر نشاط', 'date')], rows, totals: { total: sum(rows, 'total') }, kpis: [['إجمالي العمليات', num(log.length)], ['عمليات حذف', num(sum(rows, 'del'))]] }
  },
}

REPORTS.monthly_summary = {
  title: 'الملخص الشهري (مقارنة الشهور)', perm: 'reports',
  async run({ from, to }) {
    const [moves, si, pi, cash, ex, sc] = await Promise.all([
      safeList('stock_moves', { filters: [...inRange('move_date', from, to), ['qty', 'gt', 0]], select: 'move_date,qty,reason,doc_type' }),
      safeList('sales_invoices', { filters: [...inRange('inv_date', from, to), ['status', 'eq', 'approved']], select: 'inv_date,total' }),
      safeList('supplier_invoices', { filters: [...inRange('inv_date', from, to), ['status', 'eq', 'approved']], select: 'inv_date,total' }),
      safeList('cash_transactions', { filters: [...inRange('tx_date', from, to), ['status', 'eq', 'approved']], select: 'tx_date,kind,amount,party_type' }),
      safeList('expenses', { filters: [...inRange('exp_date', from, to), ['status', 'eq', 'approved']], select: 'exp_date,amount' }),
      safeList('scrap_records', { filters: [...inRange('rec_date', from, to), ['status', 'eq', 'approved']], select: 'rec_date,weight' }),
    ])
    const months = []
    for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 60; m = addMonthKey(m)) months.push(m)
    const by = (rows, dk, vk, pred = () => true) => (m) => sum(rows.filter((r) => String(r[dk]).startsWith(m) && pred(r)), vk)
    const rows = months.map((m) => {
      const r = { m, prod: by(moves, 'move_date', 'qty', (x) => x.reason === 'استلام إنتاج')(m), rawin: by(moves, 'move_date', 'qty', (x) => x.doc_type === 'gate_in')(m), sales: by(si, 'inv_date', 'total')(m), coll: by(cash, 'tx_date', 'amount', (x) => x.kind === 'receipt' && x.party_type === 'customer')(m), purch: by(pi, 'inv_date', 'total')(m), paid: by(cash, 'tx_date', 'amount', (x) => x.kind === 'payment' && x.party_type === 'supplier')(m), exp: by(ex, 'exp_date', 'amount')(m), scrap: by(sc, 'rec_date', 'weight')(m) }
      r.net = r.sales - r.purch - r.exp
      return r
    })
    const tot = Object.fromEntries(['prod', 'rawin', 'sales', 'coll', 'purch', 'paid', 'exp', 'scrap', 'net'].map((k) => [k, sum(rows, k)]))
    return {
      columns: [T('m', 'الشهر', 'text', { value: (r) => `${MONTHS[Number(r.m.slice(5, 7)) - 1]} ${r.m.slice(0, 4)}` }), T('prod', 'الإنتاج', 'num'), T('rawin', 'خامات واردة', 'num'), T('sales', 'المبيعات', 'money'), T('coll', 'التحصيل', 'money'), T('purch', 'المشتريات', 'money'), T('paid', 'المدفوع للموردين', 'money'), T('exp', 'المصروفات', 'money'), T('scrap', 'الهالك (كجم)', 'num'), T('net', 'مبيعات − مشتريات − مصروفات', 'money')],
      rows, totals: tot, chart: rows.length > 1 ? rows.map((r) => ({ label: MONTHS[Number(r.m.slice(5, 7)) - 1], v: r.sales })) : null,
      kpis: [['إجمالي المبيعات', money(tot.sales)], ['إجمالي المصروفات', money(tot.exp)], ['أعلى شهر مبيعات', rows.length ? (([r]) => `${MONTHS[Number(r.m.slice(5, 7)) - 1]} ${r.m.slice(0, 4)}`)([...rows].sort((a, b) => b.sales - a.sales)) : '—']],
    }
  },
}
const addMonthKey = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}` }

// ═════════ قائمة الأرباح والخسائر ═════════
async function pnlFetch(from, to) {
  const [si, ss, outMoves, adjMoves, ex, trips, dtx, etx] = await Promise.all([
    safeList('sales_invoices', { filters: [...inRange('inv_date', from, to), ['status', 'eq', 'approved']], select: 'inv_date,subtotal,discount,transport_cost,tax_amount,total' }),
    safeList('scrap_sales', { filters: [...inRange('sale_date', from, to), ['status', 'eq', 'approved']], select: 'sale_date,total' }),
    safeList('stock_moves', { filters: [...inRange('move_date', from, to), ['doc_type', 'in', ['gate_out', 'scrap_sales']]], select: 'move_date,qty,unit_cost,doc_type' }),
    safeList('stock_moves', { filters: [...inRange('move_date', from, to), ['doc_type', 'eq', 'stock_docs']], select: 'move_date,qty,unit_cost,reason' }),
    safeList('expenses', { filters: [...inRange('exp_date', from, to), ['status', 'eq', 'approved']], select: 'exp_date,amount,category,wo_id' }),
    safeList('trips', { filters: [...inRange('trip_date', from, to), ['status', 'eq', 'approved']], select: 'trip_date,fare' }),
    safeList('driver_transactions', { filters: inRange('tx_date', from, to), select: 'tx_date,kind,amount' }),
    safeList('employee_transactions', { filters: inRange('tx_date', from, to), select: 'tx_date,kind,amount' }),
  ])
  return { si, ss, outMoves, adjMoves, ex, trips, dtx, etx }
}
// بيحسب الأرباح والخسائر من بيانات متحمّلة، لفترة جزئية منها
function pnlCalc(raw, from, to) {
  const inP = (k) => (r) => { const d = String(r[k]).slice(0, 10); return d >= from && d <= to }
  const si = raw.si.filter(inP('inv_date')), ss = raw.ss.filter(inP('sale_date')), outMoves = raw.outMoves.filter(inP('move_date')), adjMoves = raw.adjMoves.filter(inP('move_date'))
  const ex = raw.ex.filter(inP('exp_date')), trips = raw.trips.filter(inP('trip_date')), dtx = raw.dtx.filter(inP('tx_date')), etx = raw.etx.filter(inP('tx_date'))
  const val = (m) => Math.abs(n(m.qty)) * n(m.unit_cost)
  const adj = adjMoves.filter((m) => m.reason === 'فرق جرد' || /تسوية/.test(m.reason || ''))
  const d = {
    sales: sum(si, (x) => n(x.subtotal) - n(x.discount)), transportRev: sum(si, 'transport_cost'), scrapRev: sum(ss, 'total'), vat: sum(si, 'tax_amount'),
    cogs: sum(outMoves.filter((m) => m.doc_type === 'gate_out' && m.qty < 0), val), scrapCost: sum(outMoves.filter((m) => m.doc_type === 'scrap_sales' && m.qty < 0), val),
    invLoss: sum(adj.filter((m) => m.qty < 0), val), invGain: sum(adj.filter((m) => m.qty > 0), val),
    transport: sum(trips, 'fare'),
    drivers: sum(dtx.filter((x) => ['bonus', 'salary'].includes(x.kind)), 'amount') - sum(dtx.filter((x) => x.kind === 'deduction'), 'amount'),
    payroll: sum(etx.filter((x) => ['salary_payment', 'bonus', 'overtime'].includes(x.kind)), 'amount') - sum(etx.filter((x) => x.kind === 'deduction'), 'amount'),
    opex: Object.entries(groupBy(ex.filter((e) => !e.wo_id), (e) => e.category)).map(([c, es]) => ({ c, v: sum(es, 'amount') })).sort((a, b) => b.v - a.v),
    woDirect: sum(ex.filter((e) => e.wo_id), 'amount'),
  }
  d.revenue = d.sales + d.transportRev + d.scrapRev
  d.cost = d.cogs + d.scrapCost
  d.gross = d.revenue - d.cost
  d.opexTotal = sum(d.opex, 'v')
  d.operating = d.opexTotal + d.transport + d.drivers + d.payroll
  d.net = d.gross - d.operating - d.invLoss + d.invGain
  return d
}
async function pnlData(from, to) { return pnlCalc(await pnlFetch(from, to), from, to) }
const monthLast = (m) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}` }

REPORTS.pnl = {
  title: 'قائمة الأرباح والخسائر', perm: 'reports',
  async run({ from, to }) {
    const d = await pnlData(from, to)
    // نفس المدة اللي قبلها للمقارنة
    const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1
    const pTo = addDays(from, -1), pFrom = addDays(from, -days)
    const p = await pnlData(pFrom, pTo)
    const rows = []
    const L = (label, v, pv, kind) => { const k = kind || (label.startsWith('   ') ? 'item' : 'total'); v = v === null ? null : v || 0; pv = pv === null ? null : pv || 0; rows.push({ label: label.trim(), v, pv, kind: k, pct: v !== null && d.revenue ? v / d.revenue * 100 : null, ch: v !== null && pv ? (v - pv) / Math.abs(pv) * 100 : null }) }
    L('الإيرادات', null, null, 'head')
    L('   مبيعات المنتجات (بعد الخصم ومن غير الضريبة)', d.sales, p.sales)
    if (d.transportRev || p.transportRev) L('   إيراد نقل محمّل على العملاء', d.transportRev, p.transportRev)
    if (d.scrapRev || p.scrapRev) L('   مبيعات الخردة', d.scrapRev, p.scrapRev)
    L('إجمالي الإيرادات', d.revenue, p.revenue, 'total')
    L('تكلفة المبيعات', null, null, 'head')
    L('   تكلفة البضاعة المسلّمة للعملاء', -d.cogs, -p.cogs)
    if (d.scrapCost || p.scrapCost) L('   تكلفة الخردة المباعة', -d.scrapCost, -p.scrapCost)
    L('مجمل الربح', d.gross, p.gross, 'total')
    L('المصروفات', null, null, 'head')
    const cats = [...new Set([...d.opex.map((x) => x.c), ...p.opex.map((x) => x.c)])]
    for (const c of cats) L('   ' + c, -(d.opex.find((x) => x.c === c)?.v || 0), -(p.opex.find((x) => x.c === c)?.v || 0))
    if (d.transport || p.transport) L('   نقلات السائقين', -d.transport, -p.transport)
    if (d.drivers || p.drivers) L('   رواتب ومكافآت السائقين', -d.drivers, -p.drivers)
    if (d.payroll || p.payroll) L('   مرتبات ومكافآت وإضافي الموظفين', -d.payroll, -p.payroll)
    L('إجمالي المصروفات', -d.operating, -p.operating, 'total')
    if (d.invLoss || d.invGain || p.invLoss || p.invGain) L('فروق جرد وتسويات مخزون', d.invGain - d.invLoss, p.invGain - p.invLoss)
    L(d.net >= 0 ? 'صافي الربح' : 'صافي الخسارة', d.net, p.net, 'net')
    return {
      title: `قائمة الأرباح والخسائر من ${fmtDate(from)} إلى ${fmtDate(to)}`,
      columns: [T('label', 'البند'), T('v', 'الفترة الحالية', 'money'), T('pct', '% من الإيرادات', 'pct'), T('pv', `الفترة السابقة (${fmtDate(pFrom)} — ${fmtDate(pTo)})`, 'money'), T('ch', 'التغيير', 'pct')],
      rows,
      kpis: [['إجمالي الإيرادات', money(d.revenue)], ['مجمل الربح', `${money(d.gross)} (${num(d.revenue ? d.gross / d.revenue * 100 : 0)}%)`], ['إجمالي المصروفات', money(d.operating)], [d.net >= 0 ? 'صافي الربح' : 'صافي الخسارة', `${money(Math.abs(d.net))} (${num(d.revenue ? d.net / d.revenue * 100 : 0)}%)`]],
      pnl: { net: d.net, revenue: d.revenue },
      extra: { title: 'ملاحظات على الحساب', columns: [T('t', 'ملاحظة')], rows: [
        { t: 'المبيعات محسوبة من فواتير المبيعات المعتمدة من غير ضريبة القيمة المضافة' + (d.vat ? ` (الضريبة المحصّلة ${money(d.vat)} مستحقة للضرائب ومش إيراد)` : '') },
        { t: 'تكلفة المبيعات = تكلفة المنتجات اللي خرجت بأذون خروج معتمدة، بالتكلفة المحسوبة من أوامر التشغيل' },
        { t: 'فواتير المشتريات مش مصروف: الخامات بتدخل المخزون وبتتحمّل على التكلفة لما المنتج يتباع' },
        { t: 'المصروفات المربوطة بأمر تشغيل' + (d.woDirect ? ` (${money(d.woDirect)})` : '') + ' داخلة في تكلفة الإنتاج، فمش متكررة هنا' },
        { t: 'لو العمالة متسجلة في تكاليف أمر التشغيل، متسجلهاش تاني كمصروف «أجور» عشان متتحسبش مرتين' },
      ] },
    }
  },
}

REPORTS.pnl_monthly = {
  title: 'الأرباح والخسائر شهر بشهر', perm: 'reports',
  async run({ from, to }) {
    const months = []
    for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 36; m = addMonthKey(m)) months.push(m)
    const raw = await pnlFetch(from, to)
    const rows = months.map((m) => {
      const f = m === from.slice(0, 7) ? from : m + '-01'
      const t = monthLast(m) > to ? to : monthLast(m)
      const d = pnlCalc(raw, f, t)
      return { m, rev: d.revenue, cost: d.cost, gross: d.gross, exp: d.operating, inv: d.invGain - d.invLoss, net: d.net, margin: d.revenue ? d.net / d.revenue * 100 : null }
    })
    const tot = Object.fromEntries(['rev', 'cost', 'gross', 'exp', 'inv', 'net'].map((k) => [k, sum(rows, k)]))
    return {
      columns: [T('m', 'الشهر', 'text', { value: (r) => `${MONTHS[Number(r.m.slice(5, 7)) - 1]} ${r.m.slice(0, 4)}` }), T('rev', 'الإيرادات', 'money'), T('cost', 'تكلفة المبيعات', 'money'), T('gross', 'مجمل الربح', 'money'), T('exp', 'المصروفات', 'money'), T('inv', 'فروق المخزون', 'money'), T('net', 'صافي الربح / الخسارة', 'money'), T('margin', 'هامش صافي', 'pct')],
      rows, totals: tot, chart: rows.length > 1 ? rows.map((r) => ({ label: MONTHS[Number(r.m.slice(5, 7)) - 1], v: Math.max(0, r.net) })) : null,
      kpis: [['صافي الفترة', money(tot.net)], ['الشهور', `${rows.filter((r) => r.net > 0).length} ربح — ${rows.filter((r) => r.net < 0).length} خسارة`]],
    }
  },
}

// ═════════ التقرير السنوي (مقارنة بالسنة اللي فاتت) ═════════
REPORTS.annual = {
  title: 'التقرير السنوي', perm: 'reports', yearly: true,
  async run({ from }) {
    const Y = Number(String(from).slice(0, 4)), P = Y - 1
    const [raw, moves, scrap, wos] = await Promise.all([
      pnlFetch(`${P}-01-01`, `${Y}-12-31`),
      safeList('stock_moves', { filters: [...inRange('move_date', `${P}-01-01`, `${Y}-12-31`), ['qty', 'gt', 0]], select: 'move_date,qty,reason,doc_type' }),
      safeList('scrap_records', { filters: [...inRange('rec_date', `${P}-01-01`, `${Y}-12-31`), ['status', 'eq', 'approved']], select: 'rec_date,weight' }),
      safeList('work_orders', { filters: inRange('start_date', `${P}-01-01`, `${Y}-12-31`), select: 'start_date,status' }),
    ])
    const prod = (f, t) => sum(moves.filter((m) => m.reason === 'استلام إنتاج' && m.move_date >= f && m.move_date <= t), 'qty')
    const rawIn = (f, t) => sum(moves.filter((m) => m.doc_type === 'gate_in' && m.move_date >= f && m.move_date <= t), 'qty')
    const scr = (f, t) => sum(scrap.filter((m) => m.rec_date >= f && m.rec_date <= t), 'weight')
    const wo = (f, t) => wos.filter((w) => w.start_date >= f && w.start_date <= t).length
    const rows = []
    for (let i = 1; i <= 12; i++) {
      const mm = String(i).padStart(2, '0')
      const c = pnlCalc(raw, `${Y}-${mm}-01`, monthLast(`${Y}-${mm}`)), p = pnlCalc(raw, `${P}-${mm}-01`, monthLast(`${P}-${mm}`))
      rows.push({ m: MONTHS[i - 1], rev: c.revenue, revP: p.revenue, revCh: p.revenue ? (c.revenue - p.revenue) / p.revenue * 100 : null, gross: c.gross, exp: c.operating, net: c.net, netP: p.net,
        prod: prod(`${Y}-${mm}-01`, monthLast(`${Y}-${mm}`)), scrap: scr(`${Y}-${mm}-01`, monthLast(`${Y}-${mm}`)), wo: wo(`${Y}-${mm}-01`, monthLast(`${Y}-${mm}`)) })
    }
    const cy = pnlCalc(raw, `${Y}-01-01`, `${Y}-12-31`), py = pnlCalc(raw, `${P}-01-01`, `${P}-12-31`)
    const ch = (a, b) => (b ? `${num((a - b) / Math.abs(b) * 100)}%` : '—')
    const best = [...rows].sort((a, b) => b.net - a.net)[0]
    const tot = Object.fromEntries(['rev', 'revP', 'gross', 'exp', 'net', 'netP', 'prod', 'scrap', 'wo'].map((k) => [k, sum(rows, k)]))
    const summary = [
      { l: 'إجمالي الإيرادات', c: cy.revenue, p: py.revenue }, { l: 'تكلفة المبيعات', c: cy.cost, p: py.cost }, { l: 'مجمل الربح', c: cy.gross, p: py.gross },
      { l: 'إجمالي المصروفات', c: cy.operating, p: py.operating }, { l: 'صافي الربح / الخسارة', c: cy.net, p: py.net },
      { l: 'الإنتاج (كمية)', c: prod(`${Y}-01-01`, `${Y}-12-31`), p: prod(`${P}-01-01`, `${P}-12-31`), q: true }, { l: 'خامات واردة (كمية)', c: rawIn(`${Y}-01-01`, `${Y}-12-31`), p: rawIn(`${P}-01-01`, `${P}-12-31`), q: true },
      { l: 'الهالك (كجم)', c: scr(`${Y}-01-01`, `${Y}-12-31`), p: scr(`${P}-01-01`, `${P}-12-31`), q: true }, { l: 'أوامر التشغيل', c: wo(`${Y}-01-01`, `${Y}-12-31`), p: wo(`${P}-01-01`, `${P}-12-31`), q: true },
    ].map((r) => ({ ...r, ch: r.p ? (r.c - r.p) / Math.abs(r.p) * 100 : null }))
    return {
      title: `التقرير السنوي ${Y} (مقارنة بـ ${P})`,
      columns: [T('m', 'الشهر'), T('rev', `الإيرادات ${Y}`, 'money'), T('revP', `الإيرادات ${P}`, 'money'), T('revCh', 'التغيير', 'pct'), T('gross', 'مجمل الربح', 'money'), T('exp', 'المصروفات', 'money'), T('net', `صافي ${Y}`, 'money'), T('netP', `صافي ${P}`, 'money'), T('prod', 'الإنتاج', 'num'), T('scrap', 'الهالك (كجم)', 'num'), T('wo', 'أوامر التشغيل', 'num')],
      rows, totals: tot, chart: rows.map((r) => ({ label: r.m, v: r.rev })),
      kpis: [[`إيرادات ${Y}`, `${money(cy.revenue)} (${ch(cy.revenue, py.revenue)})`], [`صافي ${cy.net >= 0 ? 'ربح' : 'خسارة'} ${Y}`, `${money(Math.abs(cy.net))} (${ch(cy.net, py.net)})`], ['هامش الربح الصافي', num(cy.revenue ? cy.net / cy.revenue * 100 : 0) + '%'], ['أفضل شهر', best && best.net ? best.m : '—']],
      extra: { title: `ملخص سنة ${Y} مقارنة بسنة ${P}`, columns: [T('l', 'البند'), T('c', String(Y), 'money', { value: (r) => (r.q ? null : r.c) }), T('cq', `${Y} (كمية)`, 'num', { value: (r) => (r.q ? r.c : null) }), T('p', String(P), 'money', { value: (r) => (r.q ? null : r.p) }), T('pq', `${P} (كمية)`, 'num', { value: (r) => (r.q ? r.p : null) }), T('ch', 'التغيير', 'pct')], rows: summary },
    }
  },
}

async function partyReport(kind, from, to, R) {
  const [bal, led] = await Promise.all([backend.list('v_party_balances'), backend.list('v_party_ledger', { filters: inRange('entry_date', from, to) })])
  const kinds = kind === 'customer' ? ['customer', 'both', 'scrap_buyer'] : ['supplier', 'both']
  const rows = bal.filter((b) => kinds.includes(b.kind)).map((b) => {
    const l = led.filter((x) => x.party_id === b.party_id)
    const inv = kind === 'customer' ? sum(l.filter((x) => x.doc_type !== 'cash_transactions'), 'debit') : sum(l.filter((x) => x.doc_type === 'supplier_invoices'), 'credit')
    const paid = kind === 'customer' ? sum(l.filter((x) => x.doc_type === 'cash_transactions'), 'credit') : sum(l.filter((x) => x.doc_type === 'cash_transactions'), 'debit')
    return { ...b, inv, paid, bal: kind === 'customer' ? n(b.balance) : -n(b.balance) }
  }).filter((r) => r.inv || r.paid || Math.abs(r.bal) > 0.009)
  return {
    columns: [T('code', 'الكود'), T('name', 'الاسم'), T('phone', 'الهاتف'), T('inv', kind === 'customer' ? 'مبيعات الفترة' : 'مشتريات الفترة', 'money'), T('paid', kind === 'customer' ? 'تحصيل الفترة' : 'مدفوع الفترة', 'money'), T('bal', kind === 'customer' ? 'المديونية الحالية' : 'المستحق الحالي', 'money'), T('last_date', 'آخر تعامل', 'date')],
    rows, totals: { inv: sum(rows, 'inv'), paid: sum(rows, 'paid'), bal: sum(rows, 'bal') },
    kpis: [[kind === 'customer' ? 'إجمالي المديونيات' : 'إجمالي المستحق للموردين', money(sum(rows, 'bal'))], [kind === 'customer' ? 'تحصيل الفترة' : 'مدفوع الفترة', money(sum(rows, 'paid'))]],
  }
}

// تحويل عمود التقرير لقيمة للعرض
export const cellValue = (c, r) => (c.value ? c.value(r) : r[c.key])
export const cellShow = (c, r) => {
  const v = cellValue(c, r)
  if (v === null || v === undefined || v === '') return ''
  if (c.type === 'money') return money(v)
  if (c.type === 'num') return num(v, 3)
  if (c.type === 'pct') return num(v) + '%'
  if (c.type === 'date') return fmtDate(v)
  return String(v)
}
export const totalShow = (c, totals) => (totals && totals[c.key] !== undefined ? (c.type === 'money' ? money(totals[c.key]) : num(totals[c.key], 3)) : '')

export { pnlData }
