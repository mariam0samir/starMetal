import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { MODULES, NAV } from '../config/modules'
import { useAuth, useRoute, go, Link } from '../lib/app'
import { backend } from '../lib/backend'
import { fmtDate } from '../lib/format'

const ROLE_NAME = { admin: 'مدير النظام', manager: 'الإدارة', accounts: 'الحسابات', stores: 'المخازن', purchasing: 'المشتريات', sales: 'المبيعات', production: 'الإنتاج', quality: 'الجودة', gate: 'الأمن والبوابة', drivers: 'السائقون', none: 'بدون صلاحية' }

export function navItems(can) {
  return NAV.map(([group, items]) => [group, items.map(([key, title, icon, perm]) => {
    if (key.startsWith('/')) return { href: key, title, icon, perm }
    const m = MODULES[key]
    return { href: '/m/' + key, title: m.title, icon: m.icon, perm: m.perm }
  }).filter((x) => can(x.perm, 'view'))]).filter(([, items]) => items.length)
}

export default function Layout({ children }) {
  const { profile, can, settings } = useAuth()
  const { path } = useRoute()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const nav = useMemo(() => navItems(can), [can])
  useEffect(() => setOpen(false), [path])
  const company = settings.company || {}
  const filtered = q.trim() ? nav.map(([g, items]) => [g, items.filter((i) => i.title.includes(q.trim()))]).filter(([, i]) => i.length) : nav

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="side">
        <div className="brand">
          <span className="brand-logo"><img src={company.logo_url || '/mark.png'} alt="" /></span>
          <div><b>{company.name || 'Star Metal'}</b><small>نظام إدارة وتشغيل المصنع</small></div>
        </div>
        <div className="side-search"><Icon name="search" size={15} /><input placeholder="ابحث في القايمة…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <nav>
          {filtered.map(([group, items]) => (
            <div key={group} className="nav-g">
              <span className="nav-gt">{group}</span>
              {items.map((it) => {
                const active = it.href === '/' ? path === '/' : path === it.href || path.startsWith(it.href + '/')
                return <Link key={it.href} to={it.href} className={`nav-i ${active ? 'on' : ''}`}><Icon name={it.icon} size={17} /><span>{it.title}</span></Link>
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="side-bg" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="top">
          <button className="burger" onClick={() => setOpen((o) => !o)} aria-label="القايمة"><Icon name="menu" /></button>
          <GlobalSearch />
          <div className="top-r">
            <Alerts />
            <div className="me">
              <span className="avatar">{(profile?.full_name || profile?.email || '?').slice(0, 1)}</span>
              <div><b>{profile?.full_name || profile?.email}</b><small>{ROLE_NAME[profile?.role] || profile?.role}</small></div>
              <button className="icon-btn" title="تسجيل الخروج" onClick={() => backend.auth.signOut()}><Icon name="logout" /></button>
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}

// بحث سريع برقم المستند أو الباركود
function GlobalSearch() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const { can } = useAuth()
  const run = async (e) => {
    e.preventDefault()
    const s = q.trim()
    if (!s) return
    setBusy(true); setRes(null)
    const found = []
    const tasks = []
    if (can('items')) tasks.push(backend.list('items', { filters: [['code', 'eq', s]], limit: 5 }).then((r) => r.forEach((x) => found.push({ t: 'صنف', l: `${x.code} — ${x.name}`, h: '/m/items/' + x.id }))).catch(() => {}))
    if (can('items')) tasks.push(backend.list('items', { filters: [['barcode', 'eq', s]], limit: 5 }).then((r) => r.forEach((x) => found.push({ t: 'صنف', l: `${x.code} — ${x.name}`, h: '/m/items/' + x.id }))).catch(() => {}))
    if (can('items')) tasks.push(backend.list('items', { filters: [['name', 'ilike', s]], limit: 6 }).then((r) => r.forEach((x) => found.push({ t: 'صنف', l: `${x.code} — ${x.name}`, h: '/m/items/' + x.id }))).catch(() => {}))
    for (const [k, m] of Object.entries(MODULES)) {
      if (!m.fields.some((f) => f.k === 'no') || !can(m.perm)) continue
      tasks.push(backend.list(m.table, { filters: [['no', 'ilike', s]], limit: 5 }).then((r) => r.forEach((x) => found.push({ t: m.single, l: x.no, h: `/m/${k}/${x.id}` }))).catch(() => {}))
    }
    if (can('stock')) tasks.push(backend.list('stock_moves', { filters: [['batch_no', 'eq', s]], limit: 1 }).then((r) => r.length && found.push({ t: 'تشغيلة', l: s, h: '/trace?batch=' + encodeURIComponent(s) })).catch(() => {}))
    await Promise.all(tasks)
    const uniq = [...new Map(found.map((f) => [f.h, f])).values()]
    setBusy(false)
    if (uniq.length === 1) { go(uniq[0].h); setQ(''); return }
    setRes(uniq)
  }
  return (
    <form className="gsearch" onSubmit={run}>
      <Icon name={busy ? 'clock' : 'search'} size={16} />
      <input value={q} onChange={(e) => { setQ(e.target.value); setRes(null) }} placeholder="ابحث برقم مستند أو كود صنف أو باركود أو رقم تشغيلة…" />
      {res && (
        <div className="gs-res" onMouseLeave={() => setRes(null)}>
          {!res.length && <p className="muted">مفيش نتايج لـ «{q}»</p>}
          {res.map((r) => <a key={r.h} href={'#' + r.h} onClick={() => { setRes(null); setQ('') }}><span className="badge gray">{r.t}</span>{r.l}</a>)}
        </div>
      )}
    </form>
  )
}

const ALERT_LINK = { items: (id) => '/m/items/' + id, work_orders: (id) => '/m/work_orders/' + id, vehicles: (id) => '/m/vehicles/' + id, drivers: (id) => '/m/drivers/' + id, machines: (id) => '/m/machines/' + id, sales_invoices: (id) => '/m/sales_invoices/' + id, cash_transactions: (id) => '/m/cash_transactions/' + id }
function Alerts() {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let a = true
    const load = () => backend.list('v_alerts', { limit: 200 }).then((r) => a && setList(r)).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => { a = false; clearInterval(t) }
  }, [])
  return (
    <div className="alerts">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="التنبيهات"><Icon name="bell" />{list.length > 0 && <i className="dot">{list.length > 99 ? '99+' : list.length}</i>}</button>
      {open && (
        <div className="al-pop" onMouseLeave={() => setOpen(false)}>
          <h4>التنبيهات</h4>
          {!list.length && <p className="muted">مفيش تنبيهات دلوقتي</p>}
          {list.map((a, i) => <a key={i} href={'#' + (ALERT_LINK[a.ref_table]?.(a.ref_id) || '/')} className={`al ${a.level}`} onClick={() => setOpen(false)}><Icon name="alert" size={15} /><span>{a.title}{a.due_date && <small>{fmtDate(a.due_date)}</small>}</span></a>)}
        </div>
      )}
    </div>
  )
}
