// تسجيل الدخول، المستخدمين والصلاحيات، سجل العمليات، الإعدادات
import { useEffect, useMemo, useState } from 'react'
import { backend, configured } from '../lib/backend'
import { useAuth, useLoad, useToast, errMsg, useRefs } from '../lib/app'
import { fmtDateTime, today } from '../lib/format'
import { PageHead, Btn, Spinner, ErrorBox, DataTable, Modal, Select, Tabs, ImageInput, Badge } from '../ui/kit'
import Icon from '../ui/Icon'
import { MODULES } from '../config/modules'

export function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState('in')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'in') await backend.auth.signIn(email.trim(), pw)
      else {
        const r = await backend.auth.signUp(email.trim(), pw, name.trim())
        if (!r.session) setMsg('اتعمل الحساب ✓ — لو التفعيل بالإيميل شغال افتح الإيميل الأول، وبعدها المدير لازم يديك صلاحية.')
      }
    } catch (er) { setErr(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Star Metal" className="login-logo" />
        <h1>نظام إدارة المصنع</h1>
        <p className="muted">المخازن • الإنتاج • البوابة • النقل • الحسابات • التقارير</p>
        {mode === 'up' && <label className="fld"><span>الاسم</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>}
        <label className="fld"><span>الإيميل</span><input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label className="fld"><span>كلمة السر</span><input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} /></label>
        {err && <p className="err-t">{err}</p>}
        {msg && <p className="ok-t">{msg}</p>}
        <Btn kind="primary" type="submit" busy={busy} className="full">{mode === 'in' ? 'دخول' : 'إنشاء الحساب'}</Btn>
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'أول مرة؟ اعمل حساب (أول حساب بيبقى مدير النظام)' : 'عندي حساب — دخول'}</button>
      </form>
    </div>
  )
}

export function NotConfigured() {
  return (
    <div className="login"><div className="login-card wide">
      <img src="/logo.png" alt="Star Metal" className="login-logo sm" />
      <h1>السيستم محتاج يتوصل بقاعدة البيانات</h1>
      <ol className="steps">
        <li>اعمل مشروع جديد على <b>supabase.com</b>.</li>
        <li>من <b>SQL Editor</b> شغّل ملف <code>supabase/schema.sql</code> كامل.</li>
        <li>من <b>Project Settings ← API</b> انسخ الـ URL والـ Publishable key.</li>
        <li>على Vercel ضيف المتغيرين <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> واعمل Redeploy.</li>
      </ol>
    </div></div>
  )
}

export function Waiting() {
  const { profile, reload } = useAuth()
  return (
    <div className="login"><div className="login-card">
      <img src="/logo.png" alt="Star Metal" className="login-logo sm" />
      <h1>حسابك مستني تفعيل</h1>
      <p className="muted">{profile?.email}<br />مدير النظام لازم يفعّل حسابك ويحدد صلاحياتك من «المستخدمين والصلاحيات».</p>
      <Btn kind="primary" onClick={reload} className="full">تحديث</Btn>
      <button className="link" onClick={() => backend.auth.signOut()}>تسجيل الخروج</button>
    </div></div>
  )
}

// ═════════ المستخدمين والصلاحيات ═════════
export const PERM_MODULES = [
  ['dashboard', 'لوحة التحكم'], ['material_types', 'أنواع الخامات'], ['items', 'الأصناف'], ['warehouses', 'المخازن'], ['parties', 'العملاء والموردين'], ['stock', 'أذون وأرصدة المخزن'],
  ['gate_in', 'حركة الداخل'], ['gate_out', 'حركة الخارج'], ['work_orders', 'أوامر التشغيل'], ['quality', 'الجودة'], ['scrap', 'الهالك والخردة'], ['machines', 'الماكينات والصيانة'],
  ['purchasing', 'المشتريات'], ['sales', 'المبيعات'], ['drivers', 'السائقين والرحلات'], ['vehicles', 'السيارات'], ['treasury', 'الخزينة'], ['expenses', 'المصروفات'],
  ['employees', 'الموظفين'], ['costing', 'تكلفة الإنتاج'], ['reports', 'التقارير (كلها)'], ['users', 'المستخدمين'], ['audit', 'سجل العمليات'], ['settings', 'الإعدادات'],
]
const ACTS = [['can_view', 'عرض'], ['can_create', 'إضافة'], ['can_edit', 'تعديل'], ['can_delete', 'حذف'], ['can_approve', 'اعتماد']]

export function Users() {
  const { isAdmin, profile: me } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('users')
  const users = useLoad(() => backend.list('profiles', { order: 'created_at', asc: true }), [])
  const roles = useLoad(() => backend.list('roles', { order: 'sort', asc: true }), [])
  const [add, setAdd] = useState(false)
  const [nu, setNu] = useState({ email: '', password: '', full_name: '', role: 'stores' })
  const [busy, setBusy] = useState(false)
  const roleOpts = (roles.data || []).map((r) => [r.key, r.name])
  const saveUser = async (u, patch) => {
    try { await backend.update('profiles', u.id, patch); toast('اتحفظ ✓'); users.reload() } catch (e) { toast(errMsg(e), 'err') }
  }
  const create = async () => {
    setBusy(true)
    try {
      const u = await backend.auth.createUser(nu.email.trim(), nu.password, nu.full_name.trim())
      if (u?.id) {
        await new Promise((r) => setTimeout(r, 800))
        await backend.upsert('profiles', [{ id: u.id, email: nu.email.trim(), full_name: nu.full_name.trim(), role: nu.role, active: true }], 'id')
      }
      toast('اتعمل الحساب ✓'); setAdd(false); setNu({ email: '', password: '', full_name: '', role: 'stores' }); users.reload()
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  return (
    <div className="page">
      <PageHead title="المستخدمين والصلاحيات" sub="كل موظف ليه حساب ودور — والدور بيحدد يشوف ويعدّل إيه" icon="lock">
        {isAdmin && tab === 'users' && <Btn kind="primary" icon="plus" onClick={() => setAdd(true)}>مستخدم جديد</Btn>}
      </PageHead>
      <Tabs tabs={[['users', 'المستخدمين'], ['perms', 'صلاحيات كل دور']]} value={tab} onChange={setTab} />
      {tab === 'users' ? (
        <div className="card pad0">
          {users.loading ? <Spinner /> : users.error ? <ErrorBox error={users.error} /> : <DataTable rows={users.data} columns={[
            { key: 'full_name', label: 'الاسم', render: (u) => <b>{u.full_name || '—'}</b> }, { key: 'email', label: 'الإيميل', render: (u) => <span dir="ltr">{u.email}</span> },
            { key: 'role', label: 'الدور', render: (u) => isAdmin && u.id !== me.id ? <Select options={roleOpts} value={u.role} empty={false} onChange={(v) => saveUser(u, { role: v })} /> : roleOpts.find((r) => r[0] === u.role)?.[1] },
            { key: 'active', label: 'الحالة', render: (u) => isAdmin && u.id !== me.id ? <label className="chk"><input type="checkbox" checked={u.active} onChange={(e) => saveUser(u, { active: e.target.checked })} /><span>{u.active ? 'مفعّل' : 'موقوف'}</span></label> : <Badge value={u.active ? 'approved' : 'cancelled'} tone={u.active ? 'green' : 'red'} /> },
            { key: 'created_at', label: 'تاريخ الإنشاء', value: (u) => fmtDateTime(u.created_at) }]} />}
          <p className="note-bar">الموظف الجديد يقدر كمان يعمل حساب بنفسه من صفحة الدخول، وبيفضل «موقوف» لحد ما تفعّله وتحدد دوره هنا.</p>
        </div>
      ) : <PermMatrix roles={roles.data || []} canEdit={isAdmin} />}
      {add && <Modal title="مستخدم جديد" onClose={() => setAdd(false)} foot={<><Btn kind="primary" busy={busy} onClick={create} disabled={!nu.email || nu.password.length < 6}>إنشاء</Btn><Btn onClick={() => setAdd(false)}>إلغاء</Btn></>}>
        <div className="form-grid">
          <div className="fld w2"><label>الاسم</label><input value={nu.full_name} onChange={(e) => setNu({ ...nu, full_name: e.target.value })} /></div>
          <div className="fld"><label>الدور</label><Select options={roleOpts.filter((r) => r[0] !== 'none')} value={nu.role} empty={false} onChange={(v) => setNu({ ...nu, role: v })} /></div>
          <div className="fld w2"><label>الإيميل</label><input dir="ltr" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></div>
          <div className="fld"><label>كلمة السر (6 حروف على الأقل)</label><input dir="ltr" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></div>
        </div>
        <p className="help">لو تفعيل الإيميل شغال في Supabase، الموظف لازم يأكد من الإيميل قبل ما يدخل.</p>
      </Modal>}
    </div>
  )
}

function PermMatrix({ roles, canEdit }) {
  const toast = useToast()
  const editable = roles.filter((r) => r.key !== 'admin' && r.key !== 'none')
  const [role, setRole] = useState(editable[0]?.key || 'manager')
  const perms = useLoad(() => backend.list('role_perms', { filters: [['role', 'eq', role]] }), [role])
  const [rows, setRows] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { setRows(Object.fromEntries((perms.data || []).map((p) => [p.module, p]))) }, [perms.data])
  const toggle = (mod, act) => setRows((r) => ({ ...r, [mod]: { ...(r[mod] || { role, module: mod }), [act]: !r[mod]?.[act] } }))
  const save = async () => {
    setBusy(true)
    try {
      await backend.upsert('role_perms', PERM_MODULES.map(([m]) => ({ role, module: m, ...Object.fromEntries(ACTS.map(([a]) => [a, Boolean(rows[m]?.[a])])) })), 'role,module')
      toast('اتحفظت الصلاحيات ✓'); perms.reload()
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  return (
    <div className="card">
      <div className="filters">
        <label className="f-l">الدور <Select options={editable.map((r) => [r.key, r.name])} value={role} empty={false} onChange={setRole} /></label>
        {canEdit && <Btn kind="primary" icon="check" busy={busy} onClick={save}>حفظ صلاحيات الدور</Btn>}
        <span className="muted">«مدير النظام» ليه كل الصلاحيات دايمًا.</span>
      </div>
      {perms.loading ? <Spinner /> : (
        <div className="table-wrap"><table className="dt perm-t">
          <thead><tr><th>القسم</th>{ACTS.map(([a, l]) => <th key={a} className="n">{l}</th>)}</tr></thead>
          <tbody>{PERM_MODULES.map(([m, l]) => <tr key={m}><td>{l}</td>{ACTS.map(([a]) => <td key={a} className="n"><input type="checkbox" checked={Boolean(rows[m]?.[a])} onChange={() => toggle(m, a)} disabled={!canEdit} /></td>)}</tr>)}</tbody>
        </table></div>
      )}
    </div>
  )
}

// ═════════ سجل العمليات ═════════
const TABLE_NAME = Object.fromEntries([...Object.values(MODULES).map((m) => [m.table, m.title]), ['stock_doc_lines', 'أصناف أذون المخزن'], ['gate_in_lines', 'أصناف إذن الدخول'], ['gate_out_lines', 'أصناف إذن الخروج'], ['si_lines', 'أصناف فاتورة المبيعات'], ['sinv_lines', 'أصناف فاتورة المورد'], ['po_lines', 'أصناف أمر الشراء'], ['so_lines', 'أصناف أمر البيع'], ['quotation_lines', 'أصناف عرض السعر'], ['pr_lines', 'أصناف طلب الشراء'], ['wo_stages', 'مراحل أمر التشغيل'], ['scrap_sale_lines', 'أصناف بيع الخردة'], ['profiles', 'المستخدمين'], ['role_perms', 'الصلاحيات'], ['settings', 'الإعدادات'], ['parties', 'العملاء والموردين']])
const ACTION = { insert: ['إضافة', 'green'], update: ['تعديل', 'blue'], delete: ['حذف', 'red'] }
const HIDE = ['updated_at', 'created_at', 'created_by']

export function Audit() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [tbl, setTbl] = useState('')
  const [act, setAct] = useState('')
  const [view, setView] = useState(null)
  const d = useLoad(() => backend.list('audit_log', { filters: [['at', 'gte', from], ['at', 'lte', to + 'T23:59:59'], ...(tbl ? [['table_name', 'eq', tbl]] : []), ...(act ? [['action', 'eq', act]] : [])], order: 'at', limit: 3000 }), [from, to, tbl, act])
  const diff = (r) => {
    if (r.action !== 'update') return Object.entries(r.new_data || r.old_data || {}).filter(([k]) => !HIDE.includes(k)).map(([k, v]) => ({ k, a: r.action === 'delete' ? v : '', b: r.action === 'insert' ? v : '' }))
    return Object.keys({ ...r.old_data, ...r.new_data }).filter((k) => !HIDE.includes(k) && JSON.stringify(r.old_data?.[k]) !== JSON.stringify(r.new_data?.[k])).map((k) => ({ k, a: r.old_data?.[k], b: r.new_data?.[k] }))
  }
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <div className="page">
      <PageHead title="سجل العمليات" sub="مين أضاف — مين عدّل — مين حذف — وإمتى، والبيانات قبل وبعد التعديل" icon="history" />
      <div className="filters card">
        <label className="f-l">من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="f-l">إلى <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="f-l">الجدول <Select options={Object.entries(TABLE_NAME)} value={tbl} onChange={setTbl} placeholder="الكل" /></label>
        <label className="f-l">العملية <Select options={Object.entries(ACTION).map(([k, [l]]) => [k, l])} value={act} onChange={setAct} placeholder="الكل" /></label>
      </div>
      <div className="card pad0">
        {d.loading ? <Spinner /> : d.error ? <ErrorBox error={d.error} /> : <DataTable rows={d.data} onRow={setView} columns={[
          { key: 'at', label: 'الوقت', value: (r) => fmtDateTime(r.at), sortValue: (r) => r.at }, { key: 'user_name', label: 'المستخدم', value: (r) => r.user_name || 'النظام' },
          { key: 'action', label: 'العملية', render: (r) => <span className={`badge ${ACTION[r.action]?.[1]}`}>{ACTION[r.action]?.[0]}</span> },
          { key: 'table_name', label: 'القسم', value: (r) => TABLE_NAME[r.table_name] || r.table_name },
          { key: 'ref', label: 'السجل', value: (r) => (r.new_data || r.old_data)?.no || (r.new_data || r.old_data)?.name || (r.new_data || r.old_data)?.code || '' },
          { key: 'n', label: 'التغييرات', value: (r) => (r.action === 'update' ? diff(r).map((x) => x.k).slice(0, 4).join('، ') : '') }]} />}
      </div>
      {view && <Modal wide title={`${ACTION[view.action]?.[0]} — ${TABLE_NAME[view.table_name] || view.table_name} — ${fmtDateTime(view.at)}`} onClose={() => setView(null)}>
        <p className="muted">بواسطة: {view.user_name || 'النظام'}</p>
        <div className="table-wrap"><table className="dt dense"><thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead>
          <tbody>{diff(view).map((x) => <tr key={x.k}><td>{x.k}</td><td className="neg">{show(x.a)}</td><td className="pos">{show(x.b)}</td></tr>)}</tbody></table></div>
      </Modal>}
    </div>
  )
}

// ═════════ الإعدادات ═════════
export function Settings() {
  const { settings, setSettings, can, profile } = useAuth()
  const toast = useToast()
  const [co, setCo] = useState(settings.company || {})
  const [st, setSt] = useState(settings.stock || { allow_negative: false })
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState('')
  const canEdit = can('settings', 'edit')
  const save = async () => {
    setBusy(true)
    try {
      const { logo_url, ...coSave } = co
      await backend.upsert('settings', [{ key: 'company', value: coSave }, { key: 'stock', value: st }], 'key')
      const url = coSave.logo_path ? await backend.fileUrl(coSave.logo_path) : ''
      setSettings((s) => ({ ...s, company: { ...coSave, logo_url: url }, stock: st })); toast('اتحفظت الإعدادات ✓')
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  return (
    <div className="page">
      <PageHead title="الإعدادات" icon="settings">{canEdit && <Btn kind="primary" icon="check" busy={busy} onClick={save}>حفظ</Btn>}</PageHead>
      <div className="card"><h3 className="card-t">بيانات المصنع (بتظهر في الطباعة والتقارير)</h3>
        <div className="form-grid">
          <div className="fld w2"><label>اسم المصنع</label><input value={co.name || ''} onChange={(e) => setCo({ ...co, name: e.target.value })} disabled={!canEdit} /></div>
          <div className="fld"><label>الهاتف</label><input value={co.phone || ''} onChange={(e) => setCo({ ...co, phone: e.target.value })} disabled={!canEdit} /></div>
          <div className="fld w2"><label>العنوان</label><input value={co.address || ''} onChange={(e) => setCo({ ...co, address: e.target.value })} disabled={!canEdit} /></div>
          <div className="fld"><label>الرقم الضريبي</label><input value={co.tax_no || ''} onChange={(e) => setCo({ ...co, tax_no: e.target.value })} disabled={!canEdit} /></div>
          <div className="fld"><label>العملة</label><input value={co.currency || 'ج.م'} onChange={(e) => setCo({ ...co, currency: e.target.value })} disabled={!canEdit} /></div>
          <div className="fld w3"><label>اللوجو</label><ImageInput value={co.logo_path} onChange={(v) => setCo({ ...co, logo_path: v })} disabled={!canEdit} /></div>
        </div>
      </div>
      <div className="card"><h3 className="card-t">المخزون</h3>
        <label className="chk"><input type="checkbox" checked={Boolean(st.allow_negative)} onChange={(e) => setSt({ ...st, allow_negative: e.target.checked })} disabled={!canEdit} /><span>السماح بالرصيد السالب (مش مستحسن — السيستم بيمنع الصرف أكتر من الموجود)</span></label>
      </div>
      <div className="card"><h3 className="card-t">حسابي</h3>
        <p className="muted">{profile?.full_name} — <span dir="ltr">{profile?.email}</span></p>
        <div className="filters"><label className="f-l">كلمة سر جديدة <input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <Btn disabled={pw.length < 6} onClick={async () => { try { await backend.auth.changePassword(pw); setPw(''); toast('اتغيرت كلمة السر ✓') } catch (e) { toast(errMsg(e), 'err') } }}>تغيير كلمة السر</Btn></div>
      </div>
    </div>
  )
}
