import { useEffect, useMemo, useState } from 'react'
import { REPORTS, REPORT_GROUPS, loadRefs, cellValue, cellShow, totalShow } from '../lib/reports'
import { useAuth, useRoute, useToast, errMsg, go } from '../lib/app'
import { today, monthStart, monthEnd, weekStart, addDays, addMonths, fmtDate, MONTHS, money, num } from '../lib/format'
import { PageHead, Btn, Spinner, ErrorBox, DataTable, RefSelect, BarChart, Empty } from '../ui/kit'
import Icon from '../ui/Icon'
import { downloadXlsx } from '../lib/xlsx'
import { openPrint, companyHeader, table as ptable, esc } from '../lib/print'

const PARAM = { warehouse: ['المخزن', 'warehouses'], party: ['العميل / المورد', 'parties'], item: ['الصنف', 'items'], driver: ['السائق', 'drivers'], cashbox: ['الخزينة', 'cashboxes'], vehicle: ['السيارة', 'vehicles'] }

const toSheet = (title, res, subtitle) => ({
  name: title, title, subtitle,
  columns: res.columns.map((c) => ({ key: c.key, label: c.label, type: c.type === 'money' ? 'money' : c.type === 'num' ? 'num' : 'text', width: c.type === 'text' ? 22 : 15, value: (r) => (c.type === 'date' ? fmtDate(cellValue(c, r)) : cellValue(c, r)) })),
  rows: res.rows, totals: res.totals ? Object.fromEntries(Object.entries(res.totals).map(([k, v]) => [k, v])) : undefined,
})
const toHtml = (res) => (res.kpis?.length ? `<div class="kpis">${res.kpis.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : '')
  + ptable(res.columns.map((c) => ({ label: c.label, num: c.type === 'money' || c.type === 'num', value: (r) => cellShow(c, r) })), res.rows, res.totals ? Object.fromEntries([['__label', 'الإجمالي'], ...res.columns.map((c) => [c.key, totalShow(c, res.totals)])]) : null)
  + (res.extra ? `<h2>${esc(res.extra.title)}</h2>` + ptable(res.extra.columns.map((c) => ({ label: c.label, num: c.type !== 'text', value: (r) => cellShow(c, r) })), res.extra.rows) : '')

// ═════════ مركز التقارير ═════════
export default function Reports() {
  const { query } = useRoute()
  const { can, settings } = useAuth()
  const toast = useToast()
  const [key, setKey] = useState(query.r || null)
  const [p, setP] = useState({ from: query.from || monthStart(), to: query.to || today(), cashbox: query.cashbox || null })
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const rep = key && REPORTS[key]
  const groups = REPORT_GROUPS.map(([g, ks]) => [g, ks.filter((k) => can(REPORTS[k].perm) || can('reports'))]).filter(([, ks]) => ks.length)

  const run = async () => {
    if (!rep) return
    setBusy(true); setErr(null); setRes(null)
    try { const R = await loadRefs(); setRes(await rep.run(rep.singleDay ? { ...p, to: p.from } : p, R)) } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  useEffect(() => { if (key) run() }, [key]) // eslint-disable-line

  const period = rep?.noDate ? `حتى ${fmtDate(today())}` : rep?.singleDay ? fmtDate(p.from) : `من ${fmtDate(p.from)} إلى ${fmtDate(p.to)}`
  const title = res?.title || rep?.title
  const xl = () => { const sheets = [toSheet(title, res, period)]; if (res.extra) sheets.push(toSheet(res.extra.title, res.extra, period)); downloadXlsx(`${title} ${p.from}${rep.noDate ? '' : ' - ' + p.to}`, sheets) }
  const pdf = () => openPrint(title, companyHeader(settings.company, title, '', period) + toHtml(res))
  const setRange = (from, to) => setP((x) => ({ ...x, from, to }))
  const lm = addMonths(today(), -1)

  return (
    <div className="page reports">
      <PageHead title="مركز التقارير" sub="اختار التقرير والفترة — وتقدر تطبعه أو تنزّله Excel أو PDF" icon="report">
        <Btn icon="download" onClick={() => go('/periodic')}>التقارير الأسبوعية والشهرية</Btn>
      </PageHead>
      <div className="rep-layout">
        <aside className="card rep-list">
          {groups.map(([g, ks]) => <div key={g}><span className="nav-gt">{g}</span>{ks.map((k) => <button key={k} className={key === k ? 'on' : ''} onClick={() => { setKey(k); go('/reports', { r: k }) }}><Icon name="report" size={15} />{REPORTS[k].title}</button>)}</div>)}
        </aside>
        <section className="rep-body">
          {!rep ? <Empty icon="report" text="اختار تقرير من القايمة" /> : <>
            <div className="card filters">
              <b className="rep-t">{rep.title}</b>
              {!rep.noDate && <>
                <label className="f-l">{rep.singleDay ? 'اليوم' : 'من'} <input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></label>
                {!rep.singleDay && <label className="f-l">إلى <input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></label>}
                {!rep.singleDay && <div className="chips"><button onClick={() => setRange(today(), today())}>النهارده</button><button onClick={() => setRange(weekStart(), today())}>الأسبوع ده</button><button onClick={() => setRange(monthStart(), today())}>الشهر ده</button><button onClick={() => setRange(lm, monthEnd(lm))}>الشهر اللي فات</button><button onClick={() => setRange(today().slice(0, 4) + '-01-01', today())}>السنة دي</button></div>}
              </>}
              {(rep.params || []).map((k) => <label key={k} className="f-l">{PARAM[k][0]} <RefSelect table={PARAM[k][1]} value={p[k]} onChange={(v) => setP({ ...p, [k]: v })} placeholder="الكل" /></label>)}
              <Btn kind="primary" icon="search" busy={busy} onClick={run}>عرض التقرير</Btn>
              {res && <><Btn icon="excel" onClick={xl}>Excel</Btn><Btn icon="print" onClick={pdf}>PDF / طباعة</Btn></>}
            </div>
            {busy ? <Spinner text="بيجهّز التقرير…" /> : err ? <ErrorBox error={err} onRetry={run} /> : res && <>
              {res.kpis?.length > 0 && <div className="kpi-row">{res.kpis.map(([l, v]) => <div key={l} className="kpi"><span>{l}</span><b>{v}</b></div>)}</div>}
              {res.chart && <div className="card"><BarChart data={res.chart} series={[['v', rep.title, '#c8161d']]} height={180} /></div>}
              <div className="card pad0"><DataTable rows={res.rows} rowKey={null} columns={res.columns.map((c) => ({ key: c.key, label: c.label, num: c.type === 'num', money: c.type === 'money', d: 3, value: (r) => cellValue(c, r), render: (r) => cellShow(c, r) || '—', sortValue: (r) => cellValue(c, r) ?? '' }))} foot={res.totals ? { __label: `الإجمالي (${res.rows.length})`, ...res.totals } : null} /></div>
              {res.extra && <div className="card pad0"><h3 className="card-t px">{res.extra.title}</h3><DataTable dense rows={res.extra.rows} rowKey={null} columns={res.extra.columns.map((c) => ({ key: c.key, label: c.label, num: c.type !== 'text', value: (r) => cellValue(c, r), render: (r) => cellShow(c, r) }))} /></div>}
            </>}
          </>}
        </section>
      </div>
    </div>
  )
}

// ═════════ التقارير الأسبوعية والشهرية (تحميل) ═════════
const PERIODIC = [
  ['production_daily', 'الإنتاج'], ['in_out', 'الداخل والخارج'], ['stock_moves', 'حركة المخزون'], ['top_consumed', 'استهلاك الخامات'], ['work_orders', 'أوامر التشغيل'],
  ['wo_profit', 'ربحية أوامر التشغيل'], ['scrap', 'الهالك'], ['qc', 'الجودة'], ['sales', 'المبيعات'], ['purchases', 'المشتريات'], ['customers', 'العملاء'], ['suppliers', 'الموردين'],
  ['expenses', 'المصروفات'], ['treasury', 'الخزينة'], ['drivers', 'السائقين'], ['vehicles', 'السيارات'], ['machines', 'الماكينات'], ['attendance', 'الحضور'], ['stock_balance', 'رصيد المخزون آخر الفترة'], ['low_stock', 'أصناف تحت حد الطلب'],
]

export function Periodic() {
  const { can, settings } = useAuth()
  const toast = useToast()
  const [type, setType] = useState('month')
  const [anchor, setAnchor] = useState(today())
  const [month, setMonth] = useState(today().slice(0, 7))
  const allowed = PERIODIC.filter(([k]) => can(REPORTS[k].perm) || can('reports'))
  const [sel, setSel] = useState(() => Object.fromEntries(PERIODIC.map(([k]) => [k, true])))
  const [busy, setBusy] = useState('')
  const [out, setOut] = useState(null)
  const [progress, setProgress] = useState('')

  const range = useMemo(() => {
    if (type === 'week') { const f = weekStart(anchor); return { from: f, to: addDays(f, 6), name: `الأسبوع من ${fmtDate(f)} إلى ${fmtDate(addDays(f, 6))}` } }
    const f = month + '-01'; return { from: f, to: monthEnd(f), name: `شهر ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` }
  }, [type, anchor, month])

  const build = async () => {
    setBusy('build'); setOut(null)
    try {
      const R = await loadRefs()
      const parts = []
      for (const [k, l] of allowed.filter(([k]) => sel[k])) {
        setProgress(l)
        try { parts.push({ k, l, res: await REPORTS[k].run({ from: range.from, to: range.to }, R) }) } catch (e) { parts.push({ k, l, error: errMsg(e) }) }
      }
      setOut(parts)
      return parts
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(''); setProgress('') }
  }
  const title = `التقرير ${type === 'week' ? 'الأسبوعي' : 'الشهري'} — ${range.name}`
  const fileBase = `تقرير ${type === 'week' ? 'أسبوعي' : 'شهري'} ${range.from} - ${range.to}`

  const summaryRows = (parts) => parts.filter((p) => p.res?.kpis).flatMap((p) => p.res.kpis.map(([l, v]) => ({ s: p.l, l, v })))
  const excel = async () => {
    const parts = out || await build()
    if (!parts) return
    const sheets = [{ name: 'الملخص', title: settings.company?.name ? `${settings.company.name} — ${title}` : title, subtitle: `من ${fmtDate(range.from)} إلى ${fmtDate(range.to)}`, columns: [{ label: 'القسم', key: 's', width: 26 }, { label: 'المؤشر', key: 'l', width: 34 }, { label: 'القيمة', key: 'v', width: 22 }], rows: summaryRows(parts) }]
    for (const p of parts) if (p.res) { sheets.push(toSheet(p.l, p.res, range.name)); if (p.res.extra) sheets.push(toSheet(p.res.extra.title, p.res.extra, range.name)) }
    downloadXlsx(fileBase, sheets)
  }
  const pdf = async () => {
    const parts = out || await build()
    if (!parts) return
    const sum = summaryRows(parts)
    let html = companyHeader(settings.company, title, '', `${fmtDate(range.from)} — ${fmtDate(range.to)}`)
    html += `<h2>الملخص</h2><div class="kpis">${sum.map((s) => `<div><span>${esc(s.s)} — ${esc(s.l)}</span><b>${esc(s.v)}</b></div>`).join('')}</div>`
    for (const p of parts) html += `<h2 style="break-before:page">${esc(p.res?.title || REPORTS[p.k].title)}</h2>` + (p.res ? toHtml(p.res) : `<p class="note">${esc(p.error)}</p>`)
    openPrint(fileBase, html)
  }

  return (
    <div className="page">
      <PageHead title="التقارير الأسبوعية والشهرية" sub="تقرير شامل للفترة: الإنتاج والمخزون والمبيعات والتحصيل والمصروفات والنقل — نزّله Excel (كل قسم في شيت) أو PDF" icon="download" />
      <div className="card periodic">
        <div className="seg">
          <button className={type === 'week' ? 'on' : ''} onClick={() => { setType('week'); setOut(null) }}><Icon name="clock" />أسبوعي</button>
          <button className={type === 'month' ? 'on' : ''} onClick={() => { setType('month'); setOut(null) }}><Icon name="report" />شهري</button>
        </div>
        {type === 'week' ? <div className="per-pick">
          <label className="f-l">أي يوم في الأسبوع <input type="date" value={anchor} onChange={(e) => { setAnchor(e.target.value); setOut(null) }} /></label>
          <div className="chips"><button onClick={() => { setAnchor(today()); setOut(null) }}>الأسبوع ده</button><button onClick={() => { setAnchor(addDays(today(), -7)); setOut(null) }}>الأسبوع اللي فات</button></div>
        </div> : <div className="per-pick">
          <label className="f-l">الشهر <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setOut(null) }} /></label>
          <div className="chips"><button onClick={() => { setMonth(today().slice(0, 7)); setOut(null) }}>الشهر ده</button><button onClick={() => { setMonth(addMonths(today(), -1).slice(0, 7)); setOut(null) }}>الشهر اللي فات</button></div>
        </div>}
        <p className="per-range"><Icon name="clock" size={16} /> {range.name}</p>
        <h4>الأقسام اللي هتدخل في التقرير</h4>
        <div className="per-sel">
          {allowed.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={sel[k]} onChange={(e) => { setSel({ ...sel, [k]: e.target.checked }); setOut(null) }} /><span>{l}</span></label>)}
        </div>
        <div className="per-act">
          <Btn kind="primary" icon="excel" size="lg" busy={busy === 'build'} onClick={excel}>تحميل Excel</Btn>
          <Btn kind="primary" icon="print" size="lg" busy={busy === 'build'} onClick={pdf}>تحميل PDF</Btn>
          <Btn icon="eye" onClick={build} busy={busy === 'build'}>معاينة الملخص</Btn>
          {progress && <span className="muted">بيجهّز: {progress}…</span>}
        </div>
      </div>
      {out && <div className="card">
        <h3 className="card-t">ملخص {range.name}</h3>
        <div className="per-sum">{out.map((p) => <div key={p.k} className="per-box"><b>{p.l}</b>{p.error ? <small className="neg">{p.error}</small> : (p.res.kpis || [[`${p.res.rows.length} سطر`, '']]).map(([l, v]) => <div key={l}><span>{l}</span><strong>{v}</strong></div>)}</div>)}</div>
      </div>}
    </div>
  )
}
