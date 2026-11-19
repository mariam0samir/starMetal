// التنقل بين الصفحات + المستخدم والصلاحيات + الكاش المشترك + الرسائل
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { backend } from './backend'
import { DOC_REFS } from '../config/modules'

// ───────────── التنقل (Hash router) ─────────────
const readHash = () => {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/'
  const [path, qs = ''] = h.split('?')
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) }
}
export function useRoute() {
  const [r, setR] = useState(readHash)
  useEffect(() => {
    const on = () => setR(readHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return r
}
export const go = (path, query) => {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString() : ''
  location.hash = path + (qs.length > 1 ? qs : '')
}
export function Link({ to, query, children, className, title, onClick }) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : ''
  return <a href={'#' + to + qs} className={className} title={title} onClick={onClick}>{children}</a>
}

// ───────────── الرسائل السريعة ─────────────
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [list, setList] = useState([])
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random()
    setList((l) => [...l, { id, msg, tone }])
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), tone === 'err' ? 7000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{list.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  )
}
export const errMsg = (e) => {
  const m = e?.message || String(e)
  if (/row-level security|permission denied/i.test(m)) return 'مالكش صلاحية تعمل العملية دي'
  if (/duplicate key|unique/i.test(m)) return 'القيمة دي متسجلة قبل كده (كود أو رقم مكرر)'
  if (/violates foreign key/i.test(m)) return 'مينفعش تحذف ده لأنه مستخدم في مستندات تانية'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'مفيش اتصال بالإنترنت أو بالسيرفر'
  return m
}

// ───────────── المستخدم والصلاحيات ─────────────
const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [perms, setPerms] = useState({})
  const [settings, setSettings] = useState({})

  const load = useCallback(async (s) => {
    if (!s) { setProfile(null); setPerms({}); return }
    try {
      const p = await backend.get('profiles', s.user.id)
      setProfile(p || { id: s.user.id, email: s.user.email, role: 'none', active: false })
      if (p?.active && p.role !== 'admin') {
        const rows = await backend.list('role_perms', { filters: [['role', 'eq', p.role]] })
        setPerms(Object.fromEntries(rows.map((r) => [r.module, r])))
      } else setPerms({})
      if (p?.active) {
        const st = await backend.list('settings')
        const obj = Object.fromEntries(st.map((r) => [r.key, r.value]))
        if (obj.company?.logo_path) obj.company = { ...obj.company, logo_url: await backend.fileUrl(obj.company.logo_path) }
        setSettings(obj)
      }
    } catch (e) { console.error(e); setProfile({ id: s.user.id, email: s.user.email, role: 'none', active: false }) }
  }, [])

  useEffect(() => {
    let alive = true
    backend.auth.session().then((s) => { if (alive) { setSession(s); load(s) } })
    const off = backend.auth.onChange((s) => { setSession(s); load(s) })
    return () => { alive = false; off?.() }
  }, [load])

  const can = useCallback((module, act = 'view') => {
    if (!profile?.active) return false
    if (profile.role === 'admin') return true
    const r = perms[module]
    if (!r) return false
    return Boolean(r['can_' + act])
  }, [profile, perms])

  const value = useMemo(() => ({
    session, profile, perms, settings, can,
    isAdmin: profile?.active && profile.role === 'admin',
    reload: () => load(session),
    setSettings,
  }), [session, profile, perms, settings, can, load])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

// ───────────── كاش الجداول المرجعية (أصناف، مخازن، عملاء...) ─────────────
const RefCtx = createContext(null)
const EMPTY = []
const REF_ORDER = { items: 'code', parties: 'name', warehouses: 'name', material_types: 'name', machines: 'name', employees: 'name', drivers: 'name', vehicles: 'plate_no', cashboxes: 'name', process_stages: 'sort', expense_categories: 'sort', profiles: 'full_name' }
export function RefProvider({ children }) {
  const cache = useRef({})
  const [ver, setVer] = useState(0)
  const pending = useRef({})
  const get = useCallback((table) => {
    if (!table || table === '__none') return EMPTY
    const c = cache.current[table]
    if (c) return c
    if (!pending.current[table]) {
      const isDoc = DOC_REFS.includes(table)
      pending.current[table] = backend.list(table, isDoc ? { order: 'created_at', asc: false, limit: 800 } : { order: REF_ORDER[table] || 'created_at', asc: true })
        .then((rows) => { cache.current[table] = rows; setVer((v) => v + 1) })
        .catch(() => { cache.current[table] = []; setVer((v) => v + 1) })
        .finally(() => { delete pending.current[table] })
    }
    return null
  }, [])
  const invalidate = useCallback((table) => { delete cache.current[table]; setVer((v) => v + 1) }, [])
  const value = useMemo(() => ({ get, invalidate, ver }), [get, invalidate, ver])
  return <RefCtx.Provider value={value}>{children}</RefCtx.Provider>
}
export function useRef_(table) {
  const ctx = useContext(RefCtx)
  const rows = ctx.get(table)
  return rows || []
}
export function useRefs() { return useContext(RefCtx) }
export function useRefMap(table) {
  const rows = useRef_(table)
  return useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])), [rows])
}

// ───────────── تحميل بيانات ─────────────
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.resolve().then(fn).then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }))
    return () => { alive = false }
  }, [...deps, tick]) // eslint-disable-line
  return { ...state, reload: () => setTick((t) => t + 1) }
}
