// الاتصال بـ Supabase — كل كلام السيستم مع قاعدة البيانات بيعدّي من هنا
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(URL && KEY)
export const sb = configured ? createClient(URL, KEY) : null

const PAGE = 1000 // Supabase بيرجّع 1000 صف بالكتير في المرة، فبنجيب على دفعات

function applyFilters(q, filters = []) {
  for (const [col, op, val] of filters) {
    if (val === undefined) continue
    if (op === 'eq') q = q.eq(col, val)
    else if (op === 'neq') q = q.neq(col, val)
    else if (op === 'in') q = q.in(col, val)
    else if (op === 'gte') q = q.gte(col, val)
    else if (op === 'lte') q = q.lte(col, val)
    else if (op === 'gt') q = q.gt(col, val)
    else if (op === 'lt') q = q.lt(col, val)
    else if (op === 'ilike') q = q.ilike(col, `%${val}%`)
    else if (op === 'is') q = q.is(col, val)
    else if (op === 'not_null') q = q.not(col, 'is', null)
  }
  return q
}

function fail(error) {
  const e = new Error(error?.message || 'حصل خطأ في الاتصال')
  e.raw = error
  throw e
}

export const backend = {
  async list(table, { filters = [], order, asc = false, limit, select = '*' } = {}) {
    const out = []
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select(select)
      q = applyFilters(q, filters)
      if (order) q = q.order(order, { ascending: asc, nullsFirst: false })
      const to = limit ? Math.min(from + PAGE, limit) - 1 : from + PAGE - 1
      q = q.range(from, to)
      const { data, error } = await q
      if (error) fail(error)
      out.push(...data)
      if (data.length < PAGE || (limit && out.length >= limit)) break
    }
    return out
  },
  async get(table, id) {
    const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle()
    if (error) fail(error)
    return data
  },
  async insert(table, rows) {
    const { data, error } = await sb.from(table).insert(rows).select()
    if (error) fail(error)
    return data
  },
  async update(table, id, patch) {
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select()
    if (error) fail(error)
    return data?.[0]
  },
  async updateWhere(table, filters, patch) {
    const { error } = await applyFilters(sb.from(table).update(patch), filters)
    if (error) fail(error)
  },
  async remove(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id)
    if (error) fail(error)
  },
  async removeWhere(table, filters) {
    const { error } = await applyFilters(sb.from(table).delete(), filters)
    if (error) fail(error)
  },
  async upsert(table, rows, onConflict) {
    const { data, error } = await sb.from(table).upsert(rows, { onConflict }).select()
    if (error) fail(error)
    return data
  },
  async rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args)
    if (error) fail(error)
    return data
  },

  // ───── الملفات والصور ─────
  async upload(file, folder = 'uploads') {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await sb.storage.from('files').upload(path, file, { upsert: false, contentType: file.type })
    if (error) fail(error)
    return path
  },
  async fileUrl(path) {
    if (!path) return ''
    if (/^(https?:|data:|blob:)/.test(path)) return path
    const { data, error } = await sb.storage.from('files').createSignedUrl(path, 3600)
    if (error) return ''
    return data.signedUrl
  },

  // ───── تسجيل الدخول ─────
  auth: {
    async session() {
      const { data } = await sb.auth.getSession()
      return data.session
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) fail({ message: error.message === 'Invalid login credentials' ? 'الإيميل أو كلمة السر غلط' : error.message })
      return data.session
    },
    async signUp(email, password, full_name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name } } })
      if (error) fail(error)
      return data
    },
    async signOut() { await sb.auth.signOut() },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s))
      return () => data.subscription.unsubscribe()
    },
    // المدير بيعمل حساب لموظف من غير ما يخرج من حسابه
    async createUser(email, password, full_name) {
      const tmp = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'erp-tmp' } })
      const { data, error } = await tmp.auth.signUp({ email, password, options: { data: { full_name } } })
      if (error) fail(error)
      return data.user
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      if (error) fail(error)
    },
  },
}
