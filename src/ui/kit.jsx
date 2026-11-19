// عناصر الواجهة المشتركة
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { backend } from '../lib/backend'
import { useRef_, useToast, errMsg } from '../lib/app'
import { REF_LABEL } from '../config/modules'
import { label as optLabel, OPTIONS, STATUS_TONE, num, money } from '../lib/format'

export function Btn({ children, icon, kind = 'default', size, onClick, disabled, type = 'button', title, busy, className = '' }) {
  return (
    <button type={type} className={`btn ${kind} ${size || ''} ${busy ? 'busy' : ''} ${className}`} onClick={onClick} disabled={disabled || busy} title={title}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}{children && <span>{children}</span>}
    </button>
  )
}

export function Badge({ value, opt = 'status', tone }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>
  return <span className={`badge ${tone || STATUS_TONE[value] || 'gray'}`}>{optLabel(opt, value)}</span>
}

export function Spinner({ text = 'جاري التحميل…' }) {
  return <div className="spin-wrap"><span className="spinner" /> {text}</div>
}

export function Empty({ text = 'لا توجد بيانات', icon = 'box', children }) {
  return <div className="empty"><Icon name={icon} size={34} /><p>{text}</p>{children}</div>
}

export function ErrorBox({ error, onRetry }) {
  return <div className="errbox"><Icon name="alert" /> <span>{errMsg(error)}</span>{onRetry && <Btn size="sm" onClick={onRetry}>حاول تاني</Btn>}</div>
}

export function PageHead({ title, sub, icon, children }) {
  return (
    <div className="page-head">
      <div className="ph-t">{icon && <span className="ph-ic"><Icon name={icon} size={22} /></span>}<div><h1>{title}</h1>{sub && <p>{sub}</p>}</div></div>
      <div className="ph-a">{children}</div>
    </div>
  )
}

export function Modal({ title, onClose, children, wide, foot }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-h"><h3>{title}</h3><button className="x" onClick={onClose} aria-label="إغلاق"><Icon name="x" /></button></div>
        <div className="modal-b">{children}</div>
        {foot && <div className="modal-f">{foot}</div>}
      </div>
    </div>
  )
}

export function Confirm({ text, onYes, onNo, yes = 'تأكيد', danger }) {
  return (
    <Modal title="تأكيد" onClose={onNo} foot={<><Btn kind={danger ? 'danger' : 'primary'} onClick={onYes}>{yes}</Btn><Btn onClick={onNo}>رجوع</Btn></>}>
      <p className="confirm-t">{text}</p>
    </Modal>
  )
}

export function Stat({ label, value, sub, icon, tone = 'blue', onClick }) {
  return (
    <div className={`stat ${tone} ${onClick ? 'click' : ''}`} onClick={onClick}>
      <div className="stat-ic"><Icon name={icon || 'chart'} size={20} /></div>
      <div><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, l, c]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}{c !== undefined && <i>{c}</i>}</button>)}
    </div>
  )
}

// ───────────── قايمة منسدلة بالبحث (بتدعم قارئ الباركود) ─────────────
export function RefSelect({ table, value, onChange, placeholder = 'اختار…', filter, disabled, rows: given, labelFn, allowClear = true, autoFocus }) {
  const loaded = useRef_(given ? '__none' : table)
  const rows = given || loaded
  const lab = labelFn || REF_LABEL[table] || ((r) => r.name || r.no || r.id)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef(null)
  const inp = useRef(null)
  const list = useMemo(() => (filter ? rows.filter(filter) : rows).filter((r) => r.active !== false || r.id === value), [rows, filter, value])
  const cur = rows.find((r) => r.id === value)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = s ? list.filter((r) => (lab(r) + ' ' + (r.barcode || '') + ' ' + (r.phone || '')).toLowerCase().includes(s)) : list
    return f.slice(0, 80)
  }, [list, q, lab])
  useEffect(() => {
    if (!open) return
    const h = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const pick = (r) => { onChange(r ? r.id : null, r); setOpen(false); setQ('') }
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const exact = list.find((r) => r.barcode && r.barcode === q.trim()) || list.find((r) => r.code && r.code === q.trim())
      if (exact) pick(exact); else if (shown[hi]) pick(shown[hi])
    } else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div className={`rsel ${disabled ? 'dis' : ''}`} ref={box}>
      <input ref={inp} autoFocus={autoFocus} disabled={disabled} value={open ? q : cur ? lab(cur) : ''} placeholder={cur ? lab(cur) : placeholder}
        onFocus={() => { setOpen(true); setHi(0) }} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0) }} onKeyDown={key} />
      {allowClear && value && !disabled && <button type="button" className="rsel-x" onClick={() => pick(null)} aria-label="مسح"><Icon name="x" size={13} /></button>}
      {open && !disabled && (
        <ul className="rsel-l">
          {shown.length === 0 && <li className="muted">{rows.length ? 'مفيش نتايج' : 'جاري التحميل… أو القايمة فاضية'}</li>}
          {shown.map((r, i) => <li key={r.id} className={`${i === hi ? 'hi' : ''} ${r.id === value ? 'sel' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(r) }} onMouseEnter={() => setHi(i)}>{lab(r)}</li>)}
        </ul>
      )}
    </div>
  )
}

export function Select({ opt, options, value, onChange, disabled, empty = true, placeholder = '—' }) {
  const list = options || OPTIONS[opt] || []
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
      {empty && <option value="">{placeholder}</option>}
      {list.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  )
}

// ───────────── رفع الصور والمرفقات ─────────────
export function FileImage({ path, className, alt = '' }) {
  const [url, setUrl] = useState('')
  useEffect(() => { let a = true; backend.fileUrl(path).then((u) => a && setUrl(u)); return () => { a = false } }, [path])
  if (!path) return null
  return url ? <img src={url} alt={alt} className={className} /> : <span className={`img-ph ${className || ''}`} />
}

export function ImageInput({ value, onChange, disabled }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try { onChange(await backend.upload(f, 'images')) } catch (er) { toast(errMsg(er), 'err') } finally { setBusy(false) }
  }
  return (
    <div className="imgin">
      {value ? <FileImage path={value} className="imgin-p" /> : <span className="imgin-p empty"><Icon name="image" size={26} /></span>}
      {!disabled && <label className={`btn sm ${busy ? 'busy' : ''}`}><Icon name="plus" size={15} /><span>{busy ? 'جاري الرفع…' : value ? 'تغيير' : 'رفع صورة'}</span><input type="file" accept="image/*" hidden onChange={pick} /></label>}
      {!disabled && value && <Btn size="sm" kind="ghost" icon="trash" onClick={() => onChange(null)} />}
    </div>
  )
}

export function FilesInput({ value, onChange, disabled }) {
  const list = Array.isArray(value) ? value : []
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const pick = async (e) => {
    const fs = [...(e.target.files || [])]; e.target.value = ''
    if (!fs.length) return
    setBusy(true)
    try {
      const out = []
      for (const f of fs) out.push({ path: await backend.upload(f, 'attachments'), name: f.name, type: f.type })
      onChange([...list, ...out])
    } catch (er) { toast(errMsg(er), 'err') } finally { setBusy(false) }
  }
  const open = async (f) => { const u = await backend.fileUrl(f.path); if (u) window.open(u, '_blank') }
  return (
    <div className="files">
      {list.map((f, i) => (
        <span key={f.path} className="file-chip">
          <button type="button" onClick={() => open(f)}><Icon name={/image/.test(f.type) ? 'image' : 'file'} size={15} />{f.name}</button>
          {!disabled && <button type="button" className="x" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="حذف"><Icon name="x" size={12} /></button>}
        </span>
      ))}
      {!disabled && <label className={`btn sm ghost ${busy ? 'busy' : ''}`}><Icon name="plus" size={15} /><span>{busy ? 'جاري الرفع…' : 'إرفاق ملف'}</span><input type="file" multiple hidden onChange={pick} /></label>}
      {disabled && !list.length && <span className="muted">—</span>}
    </div>
  )
}

// ───────────── جدول بيانات بالترتيب ─────────────
export function DataTable({ columns, rows, onRow, empty, foot, rowKey = 'id', maxRows = 500, dense }) {
  const [sort, setSort] = useState(null)
  const [limit, setLimit] = useState(maxRows)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const c = columns.find((x) => x.key === sort.key)
    const val = (r) => (c?.sortValue ? c.sortValue(r) : c?.value ? c.value(r) : r[sort.key])
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b)
      if (x === y) return 0
      if (x === null || x === undefined || x === '') return 1
      if (y === null || y === undefined || y === '') return -1
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ar')
      return sort.asc ? r : -r
    })
  }, [rows, sort, columns])
  if (!rows.length) return empty || <Empty />
  return (
    <div className="table-wrap">
      <table className={`dt ${dense ? 'dense' : ''}`}>
        <thead><tr>{columns.map((c) => (
          <th key={c.key} className={c.num || c.money ? 'n' : ''} style={c.width ? { width: c.width } : undefined}
            onClick={() => c.sort !== false && setSort((s) => (s?.key === c.key ? { key: c.key, asc: !s.asc } : { key: c.key, asc: true }))}>
            {c.label}{sort?.key === c.key && <Icon name={sort.asc ? 'up' : 'down'} size={12} />}
          </th>))}</tr></thead>
        <tbody>
          {sorted.slice(0, limit).map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? 'click' : ''}>
              {columns.map((c) => <td key={c.key} className={c.num || c.money ? 'n' : ''}>{c.render ? c.render(r) : fmtCell(c, c.value ? c.value(r) : r[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot><tr>{columns.map((c, i) => <td key={c.key} className={c.num || c.money ? 'n' : ''}>{i === 0 && foot.__label !== undefined ? foot.__label : foot[c.key] !== undefined ? fmtCell(c, foot[c.key]) : ''}</td>)}</tr></tfoot>}
      </table>
      {sorted.length > limit && <div className="more"><Btn size="sm" onClick={() => setLimit((l) => l + 500)}>عرض المزيد ({sorted.length - limit} صف)</Btn></div>}
    </div>
  )
}
function fmtCell(c, v) {
  if (c.money) return money(v)
  if (c.num) return num(v, c.d)
  return v ?? '—'
}

// ───────────── رسوم بيانية بسيطة (SVG) ─────────────
const PALETTE = ['#c8161d', '#2a313c', '#8a929e', '#e8636a', '#5b6470', '#7a0f13', '#b9bfc8', '#d9a3a5']
export function BarChart({ data, series, height = 220, fmt = num }) {
  // data: [{label, a: 1, b: 2}], series: [['a','اسم', color]]
  const [tip, setTip] = useState(null)
  const max = Math.max(1, ...data.flatMap((d) => series.map(([k]) => Number(d[k]) || 0)))
  const W = 640, H = height, pad = { l: 8, r: 54, t: 14, b: 34 }
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b
  const gw = iw / Math.max(1, data.length), bw = Math.min(26, (gw * 0.72) / series.length)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t)
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {ticks.map((t, i) => { const y = pad.t + ih - (t / max) * ih; return <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="grid" /><text x={W - pad.r + 6} y={y + 4} className="ax">{fmtShort(t)}</text></g> })}
        {data.map((d, i) => {
          const ri = data.length - 1 - i // من اليمين للشمال
          const gx = pad.l + ri * gw + (gw - bw * series.length) / 2
          return <g key={i}>
            {series.map(([k, , color], j) => { const v = Number(d[k]) || 0; const h = (v / max) * ih; return <rect key={k} x={gx + j * bw} y={pad.t + ih - h} width={bw - 2} height={Math.max(h, v ? 1 : 0)} rx="3" fill={color || PALETTE[j]} onMouseEnter={() => setTip({ i, k })} onMouseLeave={() => setTip(null)} /> })}
            <text x={pad.l + ri * gw + gw / 2} y={H - 12} className="ax mid">{d.label}</text>
          </g>
        })}
      </svg>
      {tip && <div className="chart-tip">{data[tip.i].label} — {series.find((s) => s[0] === tip.k)[1]}: <b>{fmt(data[tip.i][tip.k])}</b></div>}
      {series.length > 1 && <div className="legend">{series.map(([k, l, c], j) => <span key={k}><i style={{ background: c || PALETTE[j] }} />{l}</span>)}</div>}
    </div>
  )
}
export function Donut({ data, size = 170, fmt = num }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0)
  let acc = 0
  const r = 60, c = 2 * Math.PI * r
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" width={size} height={size}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="#eef2f7" strokeWidth="22" />
        {total > 0 && data.map((d, i) => { const v = (Number(d.value) || 0) / total; const el = <circle key={i} cx="80" cy="80" r={r} fill="none" stroke={d.color || PALETTE[i % 8]} strokeWidth="22" strokeDasharray={`${v * c} ${c}`} strokeDashoffset={-acc * c} transform="rotate(-90 80 80)" />; acc += v; return el })}
        <text x="80" y="76" className="d-t">الإجمالي</text><text x="80" y="96" className="d-v">{fmtShort(total)}</text>
      </svg>
      <ul>{data.map((d, i) => <li key={i}><i style={{ background: d.color || PALETTE[i % 8] }} />{d.label}<b>{fmt(d.value)}</b></li>)}</ul>
    </div>
  )
}
export const fmtShort = (v) => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'م'; if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'ألف'; return num(v) }
export { PALETTE }
