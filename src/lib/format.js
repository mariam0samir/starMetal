// تنسيق الأرقام والتواريخ والتسميات العربية

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const nf3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const mf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const num = (v, d = 2) => (v === null || v === undefined || v === '' || isNaN(v) ? '—' : (d === 3 ? nf3 : nf).format(Number(v)))
export const money = (v) => (v === null || v === undefined || v === '' || isNaN(v) ? '—' : mf.format(Number(v)))
export const n = (v) => (v === null || v === undefined || v === '' || isNaN(v) ? 0 : Number(v))

const pad = (x) => String(x).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parts = (s) => String(s).slice(0, 10).split('-').map(Number)
export const today = () => ymd(new Date())
export const toDate = (d) => (d ? String(d).slice(0, 10) : '')
export const fmtDate = (d) => {
  if (!d) return '—'
  if (String(d).length <= 10) { const [y, m, dd] = parts(d); return y ? `${pad(dd)}/${pad(m)}/${y}` : String(d) }
  const x = new Date(d)
  if (isNaN(x)) return String(d)
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`
}
export const fmtDateTime = (d) => {
  if (!d) return '—'
  const x = new Date(d)
  if (isNaN(x)) return String(d)
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()} ${pad(x.getHours())}:${pad(x.getMinutes())}`
}
export const addDays = (s, k) => { const [y, m, d] = parts(s); return ymd(new Date(y, m - 1, d + k)) }
export const addMonths = (s, k) => { const [y, m] = parts(s); return ymd(new Date(y, m - 1 + k, 1)) }
export const monthStart = (d = today()) => String(d).slice(0, 8) + '01'
export const monthEnd = (d = today()) => { const [y, m] = parts(d); return ymd(new Date(y, m, 0)) }
// بداية الأسبوع = السبت
export const weekStart = (d = today()) => { const [y, m, dd] = parts(d); const x = new Date(y, m - 1, dd); return ymd(new Date(y, m - 1, dd - ((x.getDay() + 1) % 7))) }
export const hoursBetween = (a, b) => (a && b ? Math.max(0, (new Date(b) - new Date(a)) / 36e5) : 0)

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

// ─────────── القوائم الثابتة ───────────
export const OPTIONS = {
  status: [['draft', 'مسودة'], ['approved', 'معتمد'], ['cancelled', 'ملغي']],
  wo_status: [['new', 'جديد'], ['preparing', 'جاري التجهيز'], ['running', 'جاري التشغيل'], ['inspection', 'تحت الفحص'], ['completed', 'مكتمل'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغي']],
  pr_status: [['draft', 'مسودة'], ['approved', 'معتمد'], ['ordered', 'تم الطلب'], ['cancelled', 'ملغي']],
  po_status: [['draft', 'مسودة'], ['approved', 'معتمد'], ['partial', 'استلام جزئي'], ['received', 'تم الاستلام'], ['cancelled', 'ملغي']],
  q_status: [['draft', 'مسودة'], ['sent', 'اتبعت للعميل'], ['accepted', 'مقبول'], ['rejected', 'مرفوض'], ['expired', 'منتهي']],
  so_status: [['draft', 'مسودة'], ['approved', 'معتمد'], ['in_production', 'في الإنتاج'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغي']],
  priority: [['low', 'عادية منخفضة'], ['normal', 'عادية'], ['high', 'عالية'], ['urgent', 'عاجلة']],
  item_kind: [['raw', 'خامة'], ['wip', 'تحت التشغيل'], ['finished', 'منتج نهائي'], ['scrap', 'خردة / هالك'], ['consumable', 'مستلزمات'], ['spare', 'قطع غيار']],
  unit: [['kg', 'كيلو'], ['ton', 'طن'], ['piece', 'قطعة'], ['meter', 'متر'], ['sheet', 'لوح'], ['m2', 'متر مربع'], ['liter', 'لتر'], ['set', 'طقم']],
  wh_kind: [['raw', 'خامات'], ['wip', 'تحت التشغيل'], ['finished', 'منتج نهائي'], ['scrap', 'خردة وهالك'], ['spares', 'قطع غيار'], ['general', 'عام']],
  party_kind: [['customer', 'عميل'], ['supplier', 'مورد'], ['both', 'عميل ومورد'], ['scrap_buyer', 'مشتري خردة']],
  stock_kind: [['add', 'إذن إضافة'], ['issue', 'إذن صرف'], ['transfer', 'إذن تحويل'], ['return', 'مرتجع مخزن'], ['adjust', 'تسوية مخزون'], ['count', 'جرد فعلي'], ['production', 'استلام إنتاج']],
  collection: [['pending', 'لم يُحصَّل'], ['partial', 'تحصيل جزئي'], ['collected', 'تم التحصيل']],
  qc_decision: [['accept', 'مقبول'], ['conditional', 'مقبول بشرط'], ['rework', 'إعادة تشغيل'], ['scrap', 'إعدام (هالك)'], ['return', 'مرتجع للمورد']],
  scrap_source: [['production', 'إنتاج'], ['cutting', 'بواقي قص'], ['damaged', 'تالف'], ['returned', 'مرتجع'], ['qc', 'مرفوض جودة'], ['other', 'أخرى']],
  stage_status: [['pending', 'لم تبدأ'], ['running', 'جارية'], ['done', 'انتهت']],
  machine_status: [['working', 'شغالة'], ['stopped', 'متوقفة'], ['maintenance', 'في الصيانة']],
  machine_log: [['preventive', 'صيانة دورية'], ['breakdown', 'عطل'], ['repair', 'إصلاح'], ['parts', 'تغيير قطع غيار'], ['inspection', 'فحص']],
  vehicle_log: [['maintenance', 'صيانة'], ['oil', 'تغيير زيت'], ['tires', 'إطارات'], ['fuel', 'وقود'], ['breakdown', 'عطل'], ['license', 'ترخيص'], ['insurance', 'تأمين'], ['other', 'أخرى']],
  pay_type: [['per_trip', 'بالنقلة'], ['salary', 'راتب ثابت'], ['mixed', 'راتب + نقلات']],
  driver_tx: [['advance', 'سلفة'], ['deduction', 'خصم'], ['bonus', 'مكافأة'], ['salary', 'راتب مستحق']],
  emp_tx: [['advance', 'سلفة'], ['deduction', 'خصم'], ['overtime', 'إضافي'], ['bonus', 'مكافأة'], ['leave', 'إجازة'], ['salary_payment', 'صرف مرتب']],
  att_status: [['present', 'حاضر'], ['late', 'متأخر'], ['absent', 'غائب'], ['leave', 'إجازة'], ['mission', 'مأمورية'], ['holiday', 'عطلة']],
  pay_period: [['monthly', 'شهري'], ['weekly', 'أسبوعي'], ['daily', 'يومي']],
  cash_kind: [['receipt', 'قبض (وارد)'], ['payment', 'صرف (منصرف)'], ['transfer', 'تحويل بين الخزائن']],
  cash_party: [['customer', 'عميل'], ['supplier', 'مورد'], ['driver', 'سائق'], ['employee', 'موظف'], ['other', 'أخرى']],
  method: [['cash', 'نقدي'], ['transfer', 'تحويل بنكي'], ['cheque', 'شيك'], ['wallet', 'محفظة إلكترونية']],
  cashbox_kind: [['cash', 'خزينة نقدية'], ['bank', 'حساب بنكي'], ['wallet', 'محفظة']],
  fuel: [['diesel', 'سولار'], ['petrol', 'بنزين'], ['gas', 'غاز']],
  exp_kind: [['operating', 'تشغيل'], ['admin', 'إدارية'], ['vehicles', 'سيارات'], ['other', 'أخرى']],
  forms: [['sheet', 'صاج / ألواح'], ['coil', 'لفائف'], ['pipe', 'مواسير'], ['square_tube', 'مواسير مربعة/مستطيلة'], ['angle', 'زوايا'], ['beam', 'كمرات'], ['channel', 'مجاري (U)'], ['flat', 'مبسط'], ['round_bar', 'قضبان مستديرة'], ['square_bar', 'قضبان مربعة'], ['rebar', 'حديد تسليح'], ['wire', 'سلك'], ['block', 'بلوكات'], ['casting', 'مسبوكات'], ['other', 'أخرى']],
}

export const label = (opt, v) => (OPTIONS[opt]?.find((o) => o[0] === v)?.[1]) ?? (v ?? '—')

export const STATUS_TONE = {
  draft: 'gray', approved: 'green', cancelled: 'red', new: 'blue', preparing: 'amber', running: 'blue', inspection: 'purple',
  completed: 'green', delivered: 'teal', ordered: 'teal', partial: 'amber', received: 'green', sent: 'blue', accepted: 'green',
  rejected: 'red', expired: 'gray', in_production: 'blue', pending: 'gray', done: 'green', working: 'green', stopped: 'red',
  maintenance: 'amber', collected: 'green', urgent: 'red', high: 'amber', normal: 'gray', low: 'gray',
}

// وزن الصنف من المقاسات (مم) والكثافة (كجم/م³)
export function calcWeight({ form, thickness, length, width, diameter }, density = 7850) {
  const t = n(thickness) / 1000, L = n(length) / 1000, W = n(width) / 1000, D = n(diameter) / 1000
  if (!density) return null
  if (['sheet', 'coil', 'flat', 'block'].includes(form) && t && L && W) return t * L * W * density
  if (['round_bar', 'rebar', 'wire'].includes(form) && D && L) return Math.PI * (D / 2) ** 2 * L * density
  if (form === 'square_bar' && W && L) return W * W * L * density
  if (form === 'pipe' && D && t && L) return Math.PI * (D - t) * t * L * density
  if (form === 'square_tube' && W && t && L) return (2 * (W + (n(diameter) / 1000 || W)) - 4 * t) * t * L * density
  if (t && L && W) return t * L * W * density
  return null
}
