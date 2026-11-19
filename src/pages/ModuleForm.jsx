import { useEffect, useMemo, useState } from 'react'
import { MODULES, REF_LABEL } from '../config/modules'
import { backend } from '../lib/backend'
import { useAuth, useRefs, useRef_, useToast, errMsg, go, useRoute, Link } from '../lib/app'
import { label, fmtDate, fmtDateTime, num, money, n, calcWeight, toDate } from '../lib/format'
import { Btn, Badge, PageHead, Spinner, ErrorBox, RefSelect, Select, ImageInput, FilesInput, Confirm, Modal } from '../ui/kit'
import Icon from '../ui/Icon'
import { openPrint, companyHeader, table as ptable, esc } from '../lib/print'
import { DETAILS } from './details'

const GROUP_TITLE = { dims: 'المقاسات والوزن', weights: 'الوزن على الميزان', costs: 'التكاليف وسعر البيع', money: 'الحساب', totals: 'الإجماليات' }
const blankLine = (lf) => Object.fromEntries(lf.fields.filter((f) => !f.k.startsWith('_')).map((f) => [f.k, typeof f.default === 'function' ? f.default() : f.default ?? null]))
const isReq = (f, row) => (typeof f.required === 'function' ? f.required(row) : f.required)
const shown = (f, row) => !f.show || f.show(row)

export default function ModuleForm({ mkey, id }) {
  const m = MODULES[mkey]
  const isNew = id === 'new'
  const { query } = useRoute()
  const { can, settings } = useAuth()
  const refs = useRefs()
  const toast = useToast()
  const [row, setRow] = useState(null)
  const [lines, setLines] = useState([])
  const [orig, setOrig] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState('')
  const [ask, setAsk] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [errs, setErrs] = useState({})

  const load = async () => {
    setErr(null)
    try {
      if (isNew) {
        const r = { ...(m.defaults || {}) }
        for (const f of m.fields) if (f.default !== undefined && r[f.k] === undefined) r[f.k] = typeof f.default === 'function' ? f.default() : f.default
        for (const [k, v] of Object.entries(query)) if (m.fields.some((f) => f.k === k)) r[k] = v
        if (m.approvable || m.fields.some((f) => f.k === 'status' && f.options === 'status')) r.status = r.status || 'draft'
        setRow(r); setOrig(null)
        setLines(m.lines && !m.lines.optional ? [blankLine(m.lines)] : [])
      } else {
        const r = await backend.get(m.table, id)
        if (!r) throw new Error('السجل ده مش موجود أو اتمسح')
        setRow(r); setOrig(r)
        if (m.lines) setLines(await backend.list(m.lines.table, { filters: [['doc_id', 'eq', id]], order: 'sort', asc: true }))
      }
      setDirty(false); setErrs({})
    } catch (e) { setErr(e) }
  }
  useEffect(() => { setRow(null); load() }, [mkey, id]) // eslint-disable-line

  // تحذير لو في تعديلات مش متحفظة
  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', h)
    return () => removeEventListener('beforeunload', h)
  }, [dirty])

  const status = row?.status
  const posted = m.approvable && (status === 'approved' || status === 'cancelled') && orig?.status === status
  const canEdit = isNew ? can(m.perm, 'create') : can(m.perm, 'edit') && !posted
  const canApprove = m.approvable && can(m.perm, 'approve') && !isNew

  // رصيد المخزن للأصناف (للصرف والتحويل والخروج والجرد)
  const whId = row?.warehouse_id
  const needStock = m.lines?.fields.some((f) => f.type === 'stockcalc' || f.type === 'batch')
  const [stock, setStock] = useState([])
  useEffect(() => {
    if (!needStock || !whId) { setStock([]); return }
    backend.list('v_stock_balance', { filters: [['warehouse_id', 'eq', whId]] }).then(setStock).catch(() => setStock([]))
  }, [needStock, whId])
  const [allStock, setAllStock] = useState(null)
  useEffect(() => { if (mkey === 'purchase_requests') backend.list('v_item_stock').then(setAllStock).catch(() => {}) }, [mkey])

  const items = useRef_('items')
  const matTypes = useRef_('material_types')

  const set = (k, v, extra) => {
    setDirty(true)
    setRow((r) => {
      const nr = { ...r, [k]: v, ...(extra || {}) }
      return nr
    })
    setErrs((e) => ({ ...e, [k]: undefined }))
  }

  const setLine = (i, k, v, refRow) => {
    setDirty(true)
    setLines((ls) => ls.map((l, j) => {
      if (j !== i) return l
      const nl = { ...l, [k]: v }
      if (k === 'item_id' && refRow) {
        const f = m.lines.fields.find((x) => x.k === 'price')
        if (f && (!l.price || l.item_id !== v)) nl.price = m.perm === 'purchasing' ? refRow.avg_cost || null : refRow.sale_price || null
        if (m.lines.fields.some((x) => x.fillCost) && !l.unit_cost) nl.unit_cost = refRow.avg_cost || null
        if (m.lines.fields.some((x) => x.k === 'description') && !l.description) nl.description = refRow.name
      }
      return nl
    }))
  }

  // الإجماليات للمستندات اللي فيها أسعار
  const totals = useMemo(() => {
    if (!m.lines?.priced) return null
    const sub = lines.reduce((s, l) => s + n(l.qty) * n(l.price), 0)
    if (m.lines.simpleTotal) return { subtotal: sub, total: sub }
    const base = sub - n(row?.discount) + n(row?.transport_cost)
    const tax = Math.round(base * n(row?.tax_rate)) / 100
    return { subtotal: sub, tax_amount: tax, total: base + tax }
  }, [lines, row?.discount, row?.transport_cost, row?.tax_rate, m.lines])

  const validate = () => {
    const e = {}
    for (const f of m.fields) if (shown(f, row) && isReq(f, row) && (row[f.k] === null || row[f.k] === undefined || row[f.k] === '')) e[f.k] = 'مطلوب'
    if (m.lines && !m.lines.optional) {
      const real = lines.filter((l) => l.item_id || l.description)
      if (!real.length) e.__lines = 'لازم تضيف صنف واحد على الأقل'
      real.forEach((l, i) => {
        for (const f of m.lines.fields) if (shown(f, row) && isReq(f, row) && (l[f.k] === null || l[f.k] === undefined || l[f.k] === '')) e.__lines = `السطر ${i + 1}: «${f.label}» مطلوب`
        if (row.kind === 'count' && (l.counted_qty === null || l.counted_qty === undefined || l.counted_qty === '')) e.__lines = `السطر ${i + 1}: اكتب الكمية الفعلية`
      })
    }
    setErrs(e)
    return !Object.keys(e).length
  }

  const save = async ({ quiet } = {}) => {
    if (!validate()) { toast('في بيانات ناقصة — راجع الخانات الحمرا', 'err'); return null }
    setBusy('save')
    try {
      const data = {}
      for (const f of m.fields) {
        if (f.readonly || f.type === 'calc' || f.k.startsWith('_')) continue
        if (!shown(f, row)) { data[f.k] = null; continue }
        let v = row[f.k]
        if (v === '') v = null
        if (['number', 'money'].includes(f.type) && v !== null && v !== undefined) v = Number(v)
        if (f.type === 'datetime' && v) v = new Date(v).toISOString()
        data[f.k] = v === undefined ? null : v
      }
      if (m.fixed) for (const [k, op, v] of m.fixed) if (op === 'eq') data[k] = v
      if (totals) Object.assign(data, totals)
      if (isNew && (m.approvable || m.fields.some((f) => f.k === 'status' && f.options === 'status'))) data.status = 'draft'
      if (!isNew && m.approvable) delete data.status
      let rid = id
      if (isNew) { const [r] = await backend.insert(m.table, data); rid = r.id }
      else await backend.update(m.table, id, data)
      if (m.lines) {
        if (!isNew) await backend.removeWhere(m.lines.table, [['doc_id', 'eq', rid]])
        const real = lines.filter((l) => l.item_id || l.description || l.stage_id)
        if (real.length) {
          const cols = m.lines.fields.filter((f) => !f.k.startsWith('_') && f.type !== 'stockcalc').map((f) => f.k)
          await backend.insert(m.lines.table, real.map((l, i) => {
            const o = { doc_id: rid, sort: i }
            for (const k of cols) {
              const f = m.lines.fields.find((x) => x.k === k)
              let v = l[k]
              if (v === '' || v === undefined) v = null
              if (['number', 'money'].includes(f.type) && v !== null) v = Number(v)
              if (f.type === 'datetime' && v) v = new Date(v).toISOString()
              o[k] = v
            }
            return o
          }))
        }
      }
      ;['items', 'parties', 'warehouses', 'material_types', 'machines', 'employees', 'drivers', 'vehicles', 'cashboxes', 'process_stages', 'expense_categories'].includes(m.table) && refs.invalidate(m.table)
      ;['work_orders', 'purchase_orders', 'sales_orders', 'sales_invoices', 'gate_in', 'gate_out', 'quotations', 'purchase_requests'].includes(m.table) && refs.invalidate(m.table)
      setDirty(false)
      if (!quiet) toast('اتحفظ ✓')
      if (isNew) go(`/m/${mkey}/${rid}`); else await load()
      return rid
    } catch (e) { toast(errMsg(e), 'err'); return null } finally { setBusy('') }
  }

  const approve = async () => {
    setAsk(null)
    let rid = id
    if (dirty) { rid = await save({ quiet: true }); if (!rid) return }
    setBusy('approve')
    try { await backend.rpc('approve_doc', { p_table: m.table, p_id: rid }); toast('اتعمد ✓ — والحركات اترحّلت'); refs.invalidate('items'); await load() }
    catch (e) { toast(errMsg(e), 'err') } finally { setBusy('') }
  }
  const unapprove = async (cancel) => {
    setAsk(null); setBusy('unapprove')
    try { await backend.rpc('unapprove_doc', { p_table: m.table, p_id: id, p_cancel: cancel }); toast(cancel ? 'المستند اتلغى' : 'رجع مسودة — تقدر تعدله'); await load() }
    catch (e) { toast(errMsg(e), 'err') } finally { setBusy('') }
  }
  const remove = async () => {
    setAsk(null); setBusy('del')
    try { await backend.remove(m.table, id); toast('اتمسح'); refs.invalidate(m.table); setDirty(false); go('/m/' + mkey) }
    catch (e) { toast(errMsg(e), 'err') } finally { setBusy('') }
  }

  const printDoc = () => {
    const get = (t) => refs.get(t) || []
    const val = (f, r) => {
      const v = f.type === 'calc' ? f.calc(r) : r[f.k]
      if (v === null || v === undefined || v === '') return ''
      if (f.type === 'ref') { const x = get(f.ref).find((y) => y.id === v); return x ? (REF_LABEL[f.ref] || ((z) => z.name))(x) : '' }
      if (f.type === 'select') return label(f.options, v)
      if (f.type === 'date') return fmtDate(v)
      if (f.type === 'datetime') return fmtDateTime(v)
      if (f.type === 'money' || f.money) return money(v)
      if (f.type === 'number') return num(v, 3)
      if (f.type === 'check') return v ? 'نعم' : 'لا'
      if (f.type === 'files' || f.type === 'image') return ''
      return String(v)
    }
    const head = m.fields.filter((f) => !['no', 'notes', 'attachments', 'image_url', 'subtotal', 'tax_amount', 'total', 'discount', 'transport_cost', 'tax_rate'].includes(f.k) && shown(f, row) && val(f, row))
    let html = companyHeader(settings.company, (row.kind && m.tabs ? label('stock_kind', row.kind) : m.single), row.no, fmtDate(row[m.dateField] || row.created_at))
    html += `<div class="meta">${head.map((f) => `<div><span>${esc(f.label)}:</span>${esc(val(f, row))}</div>`).join('')}</div>`
    if (m.lines) {
      const lf = m.lines.fields.filter((f) => shown(f, row) && f.type !== 'stockcalc')
      html += `<h2>${esc(m.lines.title)}</h2>` + ptable(lf.map((f) => ({ label: f.label, num: ['number', 'money'].includes(f.type) || f.money, value: (l) => val(f, l) })), lines)
    }
    if (totals || row.total !== undefined && m.fields.some((f) => f.k === 'total')) {
      const t = { ...row, ...(totals || {}) }
      const tr = [['الإجمالي قبل الخصم', t.subtotal], ['خصم', t.discount], ['مصاريف نقل', t.transport_cost], [`ضريبة ${n(t.tax_rate)}%`, t.tax_amount], ['الإجمالي النهائي', t.total]].filter(([, v]) => v !== undefined && v !== null && (n(v) !== 0 || 0))
      html += `<table class="totals">${tr.map(([l, v], i) => `<tr><td>${esc(l)}</td><td class="n" ${i === tr.length - 1 ? 'style="font-weight:700"' : ''}>${money(v)}</td></tr>`).join('')}</table>`
    }
    if (row.notes) html += `<p class="note">ملاحظات: ${esc(row.notes)}</p>`
    html += `<div class="sign"><div>أعدّه</div><div>استلمه / راجعه</div><div>اعتمده</div></div>`
    openPrint(`${m.single} ${row.no || ''}`, html)
  }

  if (err) return <div className="page"><ErrorBox error={err} onRetry={load} /></div>
  if (!row) return <div className="page"><Spinner /></div>

  const mainFields = m.fields.filter((f) => !f.group && f.k !== 'status' && shown(f, row))
  const groups = [...new Set(m.fields.filter((f) => f.group).map((f) => f.group))]
  const DetailC = !isNew && m.detail && DETAILS[m.detail]
  const title = isNew ? `${m.single} جديد` : `${m.single} ${row.no || row.name || row.plate_no || ''}`

  return (
    <div className="page form-page">
      <PageHead title={title} icon={m.icon} sub={<Link to={'/m/' + mkey}>← {m.title}</Link>}>
        {!isNew && m.fields.some((f) => f.k === 'status') && <Badge value={row.status} opt={m.fields.find((f) => f.k === 'status').options} />}
        {!isNew && m.printable && <Btn icon="print" onClick={printDoc}>طباعة / PDF</Btn>}
        {canEdit && <Btn kind="primary" icon="check" busy={busy === 'save'} onClick={() => save()}>{isNew ? 'حفظ' : 'حفظ التعديلات'}</Btn>}
        {canApprove && status === 'draft' && <Btn kind="success" icon="stamp" busy={busy === 'approve'} onClick={() => setAsk('approve')}>اعتماد</Btn>}
        {canApprove && status === 'approved' && <Btn icon="undo" busy={busy === 'unapprove'} onClick={() => setAsk('unapprove')}>إلغاء الاعتماد</Btn>}
        {canApprove && status === 'draft' && <Btn kind="ghost" icon="x" onClick={() => setAsk('cancel')}>إلغاء المستند</Btn>}
        {!isNew && can(m.perm, 'delete') && !posted && status !== 'approved' && <Btn kind="ghost" icon="trash" onClick={() => setAsk('delete')} title="حذف" />}
      </PageHead>

      {posted && status === 'approved' && <div className="note-bar ok"><Icon name="stamp" /> المستند ده معتمد{row.approved_at ? ` في ${fmtDateTime(row.approved_at)}` : ''} — لو محتاج تعدّله اعمل «إلغاء الاعتماد» الأول.</div>}
      {status === 'cancelled' && <div className="note-bar bad"><Icon name="x" /> المستند ده ملغي.</div>}
      {m.approvable && status === 'draft' && !isNew && <div className="note-bar">المستند مسودة — الحركات مش هتترحّل للمخزن أو الحسابات غير بعد «اعتماد».</div>}

      <div className="card">
        <div className="form-grid">
          {mainFields.map((f) => <FieldBox key={f.k} f={f} row={row} set={set} disabled={!canEdit && !(f.editableApproved && can(m.perm, 'edit'))} err={errs[f.k]} items={items} matTypes={matTypes} />)}
        </div>
        {mainFields.some((f) => f.editableApproved) && posted && can(m.perm, 'edit') && <div className="inline-save"><Btn size="sm" icon="check" onClick={async () => { const f = mainFields.find((x) => x.editableApproved); try { await backend.update(m.table, id, { [f.k]: row[f.k] }); toast('اتحفظ ✓'); setDirty(false) } catch (e) { toast(errMsg(e), 'err') } }}>حفظ {mainFields.find((x) => x.editableApproved).label}</Btn></div>}
      </div>

      {groups.filter((g) => g !== 'totals').map((g) => (
        <div key={g} className="card">
          <h3 className="card-t">{GROUP_TITLE[g]}</h3>
          <div className="form-grid">{m.fields.filter((f) => f.group === g && shown(f, row)).map((f) => <FieldBox key={f.k} f={f} row={row} set={set} disabled={!canEdit} err={errs[f.k]} items={items} matTypes={matTypes} />)}</div>
        </div>
      ))}

      {m.lines && (
        <div className={`card ${errs.__lines ? 'has-err' : ''}`}>
          <div className="card-h"><h3 className="card-t">{m.lines.title}</h3>{errs.__lines && <span className="err-t">{errs.__lines}</span>}</div>
          <LinesEditor m={m} row={row} lines={lines} setLines={(v) => { setDirty(true); setLines(v) }} setLine={setLine} disabled={!canEdit} stock={stock} allStock={allStock} />
        </div>
      )}

      {groups.includes('totals') && (
        <div className="card totals-card">
          <div className="form-grid">{m.fields.filter((f) => f.group === 'totals' && !f.readonly).map((f) => <FieldBox key={f.k} f={f} row={row} set={set} disabled={!canEdit} />)}</div>
          <dl className="sum">
            <div><dt>الإجمالي قبل الخصم</dt><dd>{money(totals?.subtotal ?? row.subtotal)}</dd></div>
            <div><dt>الضريبة</dt><dd>{money(totals?.tax_amount ?? row.tax_amount)}</dd></div>
            <div className="big"><dt>الإجمالي النهائي</dt><dd>{money(totals?.total ?? row.total)}</dd></div>
          </dl>
        </div>
      )}
      {m.lines?.simpleTotal && <div className="card totals-card"><dl className="sum"><div className="big"><dt>الإجمالي</dt><dd>{money(totals?.total)}</dd></div></dl></div>}

      {m.fields.some((f) => f.k === 'status' && f.options !== 'status') && !m.approvable && (
        <div className="card"><div className="form-grid"><FieldBox f={m.fields.find((f) => f.k === 'status')} row={row} set={set} disabled={!canEdit} /></div></div>
      )}
      {m.approvable && m.fields.some((f) => f.k === 'status' && f.options !== 'status' && f.editableApproved) && !isNew && (
        <div className="card"><div className="form-grid"><FieldBox f={{ ...m.fields.find((f) => f.k === 'status'), readonly: false }} row={row} set={set} disabled={!can(m.perm, 'edit') || status === 'draft'} /></div>
          {can(m.perm, 'edit') && status !== 'draft' && <Btn size="sm" icon="check" onClick={async () => { try { await backend.update(m.table, id, { status: row.status }); toast('اتحفظ ✓'); load() } catch (e) { toast(errMsg(e), 'err') } }}>حفظ الحالة</Btn>}
        </div>
      )}

      {DetailC && <DetailC row={row} m={m} reload={load} lines={lines} />}

      {!isNew && <p className="meta-line">اتعمل {fmtDateTime(row.created_at)}{row.updated_at && row.updated_at !== row.created_at ? ` — آخر تعديل ${fmtDateTime(row.updated_at)}` : ''}</p>}

      {ask === 'approve' && <Confirm text={`اعتماد ${m.single}؟ بعد الاعتماد الحركات هتترحّل${m.lines ? ' للمخزن' : ''} ومش هينفع تعدّل غير لما تلغي الاعتماد.`} yes="اعتماد" onYes={approve} onNo={() => setAsk(null)} />}
      {ask === 'unapprove' && <Confirm text="إلغاء الاعتماد هيرجّع المستند مسودة ويشيل حركاته من المخزن والحسابات. متأكد؟" yes="إلغاء الاعتماد" onYes={() => unapprove(false)} onNo={() => setAsk(null)} />}
      {ask === 'cancel' && <Confirm text="إلغاء المستند نهائيًا؟ هيفضل موجود في السجل بحالة «ملغي»." yes="إلغاء المستند" danger onYes={() => unapprove(true)} onNo={() => setAsk(null)} />}
      {ask === 'delete' && <Confirm text={`حذف ${m.single} نهائيًا؟`} yes="حذف" danger onYes={remove} onNo={() => setAsk(null)} />}
    </div>
  )
}

// ───────────── خانة واحدة في النموذج ─────────────
export function FieldBox({ f, row, set, disabled, err, items, matTypes }) {
  const v = row[f.k]
  const lab = f.labelBy ? f.labelBy(row) : f.label
  const ro = disabled || f.readonly
  const help = typeof f.help === 'function' ? f.help(row) : f.help
  let input
  switch (f.type) {
    case 'textarea': input = <textarea rows={2} value={v ?? ''} onChange={(e) => set(f.k, e.target.value)} disabled={ro} />; break
    case 'number': case 'money': {
      const calc = f.calc ? f.calc(row) : null
      input = <input type="number" step="any" inputMode="decimal" value={f.calc ? (calc ?? '') : (v ?? '')} onChange={(e) => set(f.k, e.target.value)} disabled={ro || Boolean(f.calc)} />
      if (f.autoWeight && !ro) {
        const mt = matTypes?.find((x) => x.id === row.material_type_id)
        const w = calcWeight(row, Number(mt?.density) || 7850)
        input = <div className="with-btn">{input}<Btn size="sm" kind="ghost" icon="calc" title="احسب من المقاسات" disabled={!w} onClick={() => set(f.k, Math.round(w * 1000) / 1000)}>{w ? num(w, 3) : 'احسب'}</Btn></div>
      }
      break
    }
    case 'date': input = <input type="date" value={toDate(v)} onChange={(e) => set(f.k, e.target.value)} disabled={ro} />; break
    case 'datetime': input = <input type="datetime-local" value={v ? toLocal(v) : ''} onChange={(e) => set(f.k, e.target.value)} disabled={ro} />; break
    case 'time': input = <input type="time" value={v ? String(v).slice(0, 5) : ''} onChange={(e) => set(f.k, e.target.value)} disabled={ro} />; break
    case 'select': input = <Select opt={f.options} value={v} onChange={(x) => set(f.k, x)} disabled={ro} empty={!f.required} />; break
    case 'ref': input = <RefSelect table={f.ref} value={v} filter={f.refFilter} disabled={ro} onChange={(x, r) => {
      const extra = {}
      if (f.fills && r) for (const [to, from] of Object.entries(f.fills)) if (!row[to] && r[from]) extra[to] = r[from]
      set(f.k, x, extra)
    }} />; break
    case 'refname': input = <RefName f={f} v={v} set={set} ro={ro} />; break
    case 'check': input = <label className="chk"><input type="checkbox" checked={Boolean(v)} onChange={(e) => set(f.k, e.target.checked)} disabled={ro} /><span>{v ? 'نعم' : 'لا'}</span></label>; break
    case 'image': input = <ImageInput value={v} onChange={(x) => set(f.k, x)} disabled={ro} />; break
    case 'files': input = <FilesInput value={v} onChange={(x) => set(f.k, x)} disabled={ro} />; break
    case 'color': input = <input type="color" value={v || '#1f6feb'} onChange={(e) => set(f.k, e.target.value)} disabled={ro} />; break
    case 'calc': input = <div className="calc-v">{f.money ? money(f.calc(row)) : num(f.calc(row))}</div>; break
    default:
      input = <>
        <input value={v ?? ''} onChange={(e) => set(f.k, e.target.value)} disabled={ro} list={f.suggest ? 'sg-' + f.k : undefined} placeholder={f.readonly && !v ? 'بيتعمل أوتوماتيك' : ''} />
        {f.suggest && <datalist id={'sg-' + f.k}>{f.suggest.map((s) => <option key={s} value={s} />)}</datalist>}
      </>
  }
  return (
    <div className={`fld w${f.w || 1} ${err ? 'err' : ''} ${f.type === 'files' || f.type === 'image' ? 'w3' : ''}`}>
      <label>{lab}{(typeof f.required === 'function' ? f.required(row) : f.required) && <i className="req">*</i>}</label>
      {input}
      {err ? <small className="err-t">{err}</small> : help ? <small className="help">{help}</small> : null}
    </div>
  )
}
function RefName({ f, v, set, ro }) {
  const rows = useRef_(f.ref)
  return <><input value={v ?? ''} onChange={(e) => set(f.k, e.target.value)} disabled={ro} list={'rn-' + f.k} /><datalist id={'rn-' + f.k}>{rows.filter((r) => r.active !== false).map((r) => <option key={r.id} value={r.name} />)}</datalist></>
}
const toLocal = (v) => { const d = new Date(v); if (isNaN(d)) return String(v).slice(0, 16); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }

// ───────────── جدول الأصناف جوه المستند ─────────────
function LinesEditor({ m, row, lines, setLines, setLine, disabled, stock, allStock }) {
  const lf = m.lines.fields.filter((f) => shown(f, row))
  const add = () => setLines([...lines, blankLine(m.lines)])
  const del = (i) => setLines(lines.filter((_, j) => j !== i))
  const move = (i, d) => { const a = [...lines]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setLines(a) }
  const qtyOf = (item, batch) => stock.filter((s) => s.item_id === item && (!batch || s.batch_no === batch)).reduce((s, x) => s + n(x.qty), 0)
  return (
    <div className="lines">
      <div className="table-wrap">
        <table className="dt lines-t">
          <thead><tr><th style={{ width: 34 }}>#</th>{lf.map((f) => <th key={f.k} className={f.w ? 'w' + f.w : ''}>{f.label}{isReq(f, row) && <i className="req">*</i>}</th>)}{!disabled && <th style={{ width: 86 }} />}</tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="n muted">{i + 1}</td>
                {lf.map((f) => (
                  <td key={f.k} className={f.type === 'calc' || f.type === 'stockcalc' ? 'n' : ''}>
                    {f.type === 'ref' ? <RefSelect table={f.ref} value={l[f.k]} disabled={disabled} onChange={(x, r) => setLine(i, f.k, x, r)} />
                      : f.type === 'calc' ? <b>{f.money ? money(f.calc(l)) : num(f.calc(l))}</b>
                      : f.type === 'stockcalc' ? (l.item_id ? (allStock ? <span className="muted">{num(allStock.find((s) => s.item_id === l.item_id)?.qty || 0, 3)}</span> : row.warehouse_id ? <span className={qtyOf(l.item_id, l.batch_no) <= 0 ? 'neg' : 'muted'}>{num(qtyOf(l.item_id, l.batch_no), 3)}</span> : <span className="muted">اختار المخزن</span>) : '')
                      : f.type === 'batch' ? <BatchInput value={l.batch_no} onChange={(x) => setLine(i, 'batch_no', x)} disabled={disabled} options={stock.filter((s) => s.item_id === l.item_id && s.batch_no)} />
                      : f.type === 'select' ? <Select opt={f.options} value={l[f.k]} onChange={(x) => setLine(i, f.k, x)} disabled={disabled} empty={false} />
                      : f.type === 'datetime' ? <input type="datetime-local" value={l[f.k] ? toLocal(l[f.k]) : ''} onChange={(e) => setLine(i, f.k, e.target.value)} disabled={disabled} />
                      : f.type === 'number' || f.type === 'money' ? <input type="number" step="any" inputMode="decimal" value={l[f.k] ?? ''} onChange={(e) => setLine(i, f.k, e.target.value)} disabled={disabled || f.readonly} placeholder={typeof f.help === 'function' ? f.help(row) : ''} />
                      : <input value={l[f.k] ?? ''} onChange={(e) => setLine(i, f.k, e.target.value)} disabled={disabled || f.readonly} placeholder={f.help && typeof f.help === 'string' ? 'أوتوماتيك' : ''} />}
                  </td>
                ))}
                {!disabled && <td className="row-act"><button type="button" onClick={() => move(i, -1)} title="فوق"><Icon name="up" size={14} /></button><button type="button" onClick={() => move(i, 1)} title="تحت"><Icon name="down" size={14} /></button><button type="button" className="del" onClick={() => del(i)} title="حذف"><Icon name="trash" size={14} /></button></td>}
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={lf.length + 2} className="muted" style={{ textAlign: 'center', padding: 18 }}>مفيش سطور لسه</td></tr>}
          </tbody>
        </table>
      </div>
      {!disabled && <Btn size="sm" icon="plus" onClick={add}>إضافة سطر</Btn>}
    </div>
  )
}

function BatchInput({ value, onChange, disabled, options }) {
  const id = useMemo(() => 'b' + Math.random().toString(36).slice(2), [])
  return <>
    <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} list={id} placeholder={options.length ? 'اختار تشغيلة' : '—'} />
    <datalist id={id}>{options.map((o) => <option key={o.batch_no} value={o.batch_no}>{`متاح ${num(o.qty, 3)}`}</option>)}</datalist>
  </>
}
