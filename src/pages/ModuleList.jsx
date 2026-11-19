import { useMemo, useState } from 'react'
import { MODULES, REF_LABEL } from '../config/modules'
import { backend } from '../lib/backend'
import { useAuth, useLoad, useRefs, go, useRoute } from '../lib/app'
import { OPTIONS, label, fmtDate, fmtDateTime, monthStart, today, num, money, n } from '../lib/format'
import { Btn, Badge, PageHead, DataTable, Spinner, ErrorBox, Empty, RefSelect, Select, Tabs } from '../ui/kit'
import { downloadXlsx } from '../lib/xlsx'
import { openPrint, companyHeader, table as ptable } from '../lib/print'

const STATUSY = ['status']

export function cellText(f, r, refs) {
  const v = f.type === 'calc' ? f.calc(r) : r[f.k]
  if (v === null || v === undefined || v === '') return ''
  if (f.type === 'ref') { const row = refs(f.ref)?.find((x) => x.id === v); return row ? (REF_LABEL[f.ref] || ((x) => x.name))(row) : '' }
  if (f.type === 'select') return label(f.options, v)
  if (f.type === 'date') return fmtDate(v)
  if (f.type === 'datetime') return fmtDateTime(v)
  if (f.type === 'check') return v ? 'نعم' : 'لا'
  if (f.type === 'money' || f.money) return money(v)
  if (f.type === 'number') return num(v, 3)
  if (f.type === 'files') return Array.isArray(v) ? `${v.length} ملف` : ''
  return String(v)
}

export default function ModuleList({ mkey }) {
  const m = MODULES[mkey]
  const { query } = useRoute()
  const { can, settings } = useAuth()
  const refsCtx = useRefs()
  const refs = (t) => refsCtx.get(t) || []
  const [tab, setTab] = useState(query.tab || 'all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(m.dateField ? (query.from || monthStart()) : '')
  const [to, setTo] = useState(m.dateField ? (query.to || today()) : '')
  const [flt, setFlt] = useState({})

  const filterFields = m.fields.filter((f) => f.filter)
  const listFields = m.fields.filter((f) => f.list)
  // نحمّل الجداول المرجعية المستخدمة في الأعمدة
  listFields.filter((f) => f.type === 'ref').forEach((f) => refsCtx.get(f.ref))

  const { data, loading, error, reload } = useLoad(async () => {
    const filters = [...(m.fixed || [])]
    if (m.dateField && from) filters.push([m.dateField, 'gte', from])
    if (m.dateField && to) filters.push([m.dateField, 'lte', m.dateField.endsWith('_at') ? to + 'T23:59:59' : to])
    if (m.tabs && tab !== 'all') filters.push([m.tabs.field, 'eq', tab])
    for (const [k, v] of Object.entries(flt)) if (v !== null && v !== '' && v !== undefined) filters.push([k, 'eq', v])
    return backend.list(m.table, { filters, order: m.dateField || m.order || 'created_at', asc: m.asc ?? false })
  }, [mkey, tab, from, to, JSON.stringify(flt)])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!data) return []
    if (!s) return data
    const sf = m.fields.filter((f) => f.search || f.type === 'ref' && f.list)
    return data.filter((r) => sf.some((f) => cellText(f, r, refs).toLowerCase().includes(s)))
  }, [data, q, refsCtx.ver]) // eslint-disable-line

  const columns = listFields.map((f) => ({
    key: f.k, label: f.label, num: ['money', 'number'].includes(f.type) || f.money,
    value: (r) => (f.type === 'calc' ? f.calc(r) : ['money', 'number'].includes(f.type) ? (r[f.k] === null ? null : Number(r[f.k])) : cellText(f, r, refs)),
    render: f.type === 'select' && (STATUSY.includes(f.k) || /status|priority/.test(f.options)) ? (r) => <Badge value={r[f.k]} opt={f.options} />
      : f.type === 'check' ? (r) => (r[f.k] ? <span className="badge green">نعم</span> : <span className="badge gray">لا</span>)
      : f.type === 'money' || f.money ? (r) => money(f.type === 'calc' ? f.calc(r) : r[f.k]) : f.type === 'number' ? (r) => num(r[f.k], 3) : undefined,
    sortValue: (r) => (f.type === 'calc' ? f.calc(r) : ['money', 'number'].includes(f.type) ? n(r[f.k]) : f.type === 'date' || f.type === 'datetime' ? r[f.k] || '' : cellText(f, r, refs)),
  }))
  const sumKeys = listFields.filter((f) => f.type === 'money' || f.money || ['qty_required', 'weight', 'net_weight', 'qty_inspected', 'qty_accepted', 'qty_rejected', 'overtime_hours', 'downtime_hours'].includes(f.k))
  const foot = rows.length && sumKeys.length ? Object.fromEntries([['__label', `الإجمالي (${rows.length})`], ...sumKeys.map((f) => [f.k, rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + n(f.type === 'calc' ? f.calc(r) : r[f.k]), 0)])]) : null

  const exportXlsx = () => {
    downloadXlsx(`${m.title} ${from || ''} ${to || ''}`.trim(), [{
      name: m.title, title: m.title, subtitle: m.dateField ? `من ${fmtDate(from)} إلى ${fmtDate(to)}` : undefined,
      columns: listFields.map((f) => ({ label: f.label, key: f.k, type: f.type === 'money' || f.money ? 'money' : f.type === 'number' ? 'num' : 'text', value: (r) => (['money', 'number'].includes(f.type) ? r[f.k] : f.type === 'calc' ? f.calc(r) : cellText(f, r, refs)) })),
      rows, totals: foot ? { ...foot, __label: 'الإجمالي' } : undefined,
    }])
  }
  const printList = () => {
    const cols = listFields.map((f) => ({ label: f.label, num: ['money', 'number'].includes(f.type) || f.money, value: (r) => cellText(f, r, refs) }))
    openPrint(m.title, companyHeader(settings.company, m.title, '', m.dateField ? `${fmtDate(from)} — ${fmtDate(to)}` : fmtDate(today())) + ptable(cols, rows))
  }

  const tabs = m.tabs ? [['all', 'الكل'], ...OPTIONS[m.tabs.options]] : null
  const newQuery = m.tabs && tab !== 'all' ? { [m.tabs.field]: tab } : undefined

  return (
    <div className="page">
      <PageHead title={m.title} sub={m.intro} icon={m.icon}>
        {mkey === 'attendance' && can('employees', 'create') && <Btn icon="clock" onClick={() => go('/attendance-sheet')}>كشف حضور اليوم</Btn>}
        <Btn icon="excel" onClick={exportXlsx} disabled={!rows.length}>Excel</Btn>
        <Btn icon="print" onClick={printList} disabled={!rows.length}>طباعة / PDF</Btn>
        {can(m.perm, 'create') && <Btn kind="primary" icon="plus" onClick={() => go(`/m/${mkey}/new`, newQuery)}>{m.single} جديد</Btn>}
      </PageHead>

      {tabs && <Tabs tabs={tabs} value={tab} onChange={setTab} />}

      <div className="filters card">
        <div className="f-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" /></div>
        {m.dateField && <>
          <label className="f-l">من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="f-l">إلى <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <Btn size="sm" kind="ghost" onClick={() => { setFrom(''); setTo('') }}>كل الفترات</Btn>
        </>}
        {filterFields.map((f) => (
          <label key={f.k} className="f-l">{f.label}
            {f.type === 'select' ? <Select opt={f.options} value={flt[f.k]} onChange={(v) => setFlt((x) => ({ ...x, [f.k]: v }))} placeholder="الكل" />
              : f.type === 'ref' ? <RefSelect table={f.ref} value={flt[f.k]} onChange={(v) => setFlt((x) => ({ ...x, [f.k]: v }))} placeholder="الكل" />
              : f.type === 'refname' ? <Select options={(refs(f.ref)).map((r) => [r.name, r.name])} value={flt[f.k]} onChange={(v) => setFlt((x) => ({ ...x, [f.k]: v }))} placeholder="الكل" />
              : <Select options={[...new Set((data || []).map((r) => r[f.k]).filter(Boolean))].map((v) => [v, v])} value={flt[f.k]} onChange={(v) => setFlt((x) => ({ ...x, [f.k]: v }))} placeholder="الكل" />}
          </label>
        ))}
      </div>

      <div className="card pad0">
        {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} />
          : <DataTable noExport columns={columns} rows={rows} foot={foot} onRow={(r) => go(`/m/${mkey}/${r.id}`)}
              empty={<Empty text={q ? 'مفيش نتايج للبحث' : `مفيش ${m.title} ${m.dateField && from ? 'في الفترة دي' : 'لسه'}`}>{can(m.perm, 'create') && !q && <Btn kind="primary" icon="plus" onClick={() => go(`/m/${mkey}/new`, newQuery)}>إضافة {m.single}</Btn>}</Empty>} />}
      </div>
    </div>
  )
}
