import { configured } from './lib/backend'
import { AuthProvider, RefProvider, ToastProvider, useAuth, useRoute } from './lib/app'
import { MODULES } from './config/modules'
import Layout from './ui/Layout'
import { Spinner, Empty } from './ui/kit'
import Dashboard from './pages/Dashboard'
import ModuleList from './pages/ModuleList'
import ModuleForm from './pages/ModuleForm'
import Reports, { Periodic } from './pages/Reports'
import { StockBalance, Trace, Costing, Balances, AttendanceSheet } from './pages/Views'
import { Login, NotConfigured, Waiting, Users, Audit, Settings } from './pages/System'

const PAGES = {
  '/stock': [StockBalance, 'stock'], '/trace': [Trace, 'stock'], '/costing': [Costing, 'costing'], '/balances': [Balances, 'parties'],
  '/reports': [Reports, 'reports'], '/periodic': [Periodic, 'reports'], '/users': [Users, 'users'], '/audit': [Audit, 'audit'],
  '/settings': [Settings, 'settings'], '/attendance-sheet': [AttendanceSheet, 'employees'],
}

function NoAccess() { return <div className="page"><Empty icon="lock" text="مالكش صلاحية تفتح الصفحة دي — كلّم مدير النظام" /></div> }

function Router() {
  const { path } = useRoute()
  const { can } = useAuth()
  if (path === '/') return can('dashboard') ? <Dashboard /> : <Welcome />
  if (path.startsWith('/m/')) {
    const [, , key, id] = path.split('/')
    const m = MODULES[key]
    if (!m) return <div className="page"><Empty text="الصفحة دي مش موجودة" /></div>
    if (!can(m.perm)) return <NoAccess />
    return id ? <ModuleForm key={key + id} mkey={key} id={id} /> : <ModuleList key={key} mkey={key} />
  }
  const pg = PAGES[path]
  if (!pg) return <div className="page"><Empty text="الصفحة دي مش موجودة" /></div>
  const [C, perm] = pg
  // الموظف اللي عنده صلاحية قسم يقدر يشوف التقارير بتاعته
  if (!can(perm) && !(perm === 'reports')) return <NoAccess />
  return <C />
}

function Welcome() {
  const { profile } = useAuth()
  return <div className="page"><div className="hello"><div><h1>أهلًا {profile?.full_name || ''} 👋</h1><p>اختار من القايمة الجانبية.</p></div></div></div>
}

function Gate() {
  const { session, profile } = useAuth()
  if (session === undefined || (session && !profile)) return <div className="boot"><Spinner /></div>
  if (!session) return <Login />
  if (!profile.active) return <Waiting />
  return <RefProvider><Layout><Router /></Layout></RefProvider>
}

export default function App() {
  if (!configured) return <NotConfigured />
  return <ToastProvider><AuthProvider><Gate /></AuthProvider></ToastProvider>
}
