// الطباعة وحفظ PDF — بيفتح صفحة A4 منسقة بالعربي، ومنها «طباعة» أو «حفظ كـ PDF»

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export { esc }

const CSS = `
@page { size: A4; margin: 12mm 11mm; }
* { box-sizing: border-box; }
body { font-family: 'Cairo', Tahoma, Arial, sans-serif; color: #17202c; margin: 0; font-size: 12px; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ph { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2a313c; padding-bottom: 10px; margin-bottom: 14px; gap: 14px; }
.ph .co { display: flex; align-items: center; gap: 12px; }
.ph img { max-height: 56px; max-width: 140px; object-fit: contain; }
.ph h1 { font-size: 18px; margin: 0; color: #2a313c; }
.ph small { color: #5b6b80; display: block; line-height: 1.6; }
.ph .doc { text-align: left; }
.ph .doc b { display: block; font-size: 16px; color: #2a313c; }
h2 { font-size: 14px; color: #2a313c; margin: 18px 0 8px; border-right: 4px solid #d71920; padding-right: 8px; }
.meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; margin: 10px 0 14px; }
.meta div { border-bottom: 1px dotted #c9d2de; padding: 3px 0; }
.meta span { color: #5b6b80; margin-left: 6px; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
th { background: #2a313c; color: #fff; font-weight: 600; padding: 6px 5px; font-size: 11px; }
td { border: 1px solid #d5dce6; padding: 5px; font-size: 11px; }
tr:nth-child(even) td { background: #f6f8fb; }
td.n, th.n { text-align: center; white-space: nowrap; }
tfoot td { background: #fdf1dc !important; font-weight: 700; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 14px; }
.kpis div { border: 1px solid #d5dce6; border-radius: 8px; padding: 8px; }
.kpis span { color: #5b6b80; font-size: 10.5px; display: block; }
.kpis b { font-size: 15px; color: #2a313c; }
.totals { width: 45%; margin-right: auto; }
.totals td:first-child { color: #5b6b80; }
.sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 40px; text-align: center; }
.sign div { border-top: 1px solid #8592a3; padding-top: 6px; color: #5b6b80; }
.note { color: #5b6b80; font-size: 11px; margin-top: 10px; }
.foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9.5px; color: #8592a3; display: flex; justify-content: space-between; }
.bar { text-align: center; padding: 10px; background: #eef2f7; }
.bar button { font-family: inherit; font-size: 14px; padding: 8px 22px; border: 0; border-radius: 8px; background: #2a313c; color: #fff; cursor: pointer; margin: 0 4px; }
.labels { display: flex; flex-wrap: wrap; gap: 6mm; }
.label { width: 62mm; border: 1px dashed #8592a3; padding: 3mm; text-align: center; break-inside: avoid; }
.label b { display: block; font-size: 12px; }
@media print { .bar { display: none; } }
`

export function companyHeader(company = {}, docTitle = '', docNo = '', docDate = '') {
  const logo = company.logo_url || location.origin + '/logo.png'
  return `<div class="ph"><div class="co"><img src="${esc(logo)}"><div><h1>${esc(company.name || 'Star Metal')}</h1><small>${esc(company.address || '')}${company.phone ? ' — ' + esc(company.phone) : ''}${company.tax_no ? '<br>الرقم الضريبي: ' + esc(company.tax_no) : ''}</small></div></div>
  <div class="doc"><b>${esc(docTitle)}</b>${docNo ? `<small>رقم: ${esc(docNo)}</small>` : ''}${docDate ? `<small>التاريخ: ${esc(docDate)}</small>` : ''}</div></div>`
}

export function table(columns, rows, totals) {
  const th = columns.map((c) => `<th class="${c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('')
  const tr = rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.num ? 'n' : ''}">${esc(typeof c.value === 'function' ? c.value(r) : r[c.key])}</td>`).join('')}</tr>`).join('')
  const tf = totals ? `<tfoot><tr>${columns.map((c, i) => `<td class="${c.num ? 'n' : ''}">${i === 0 ? esc(totals.__label || 'الإجمالي') : esc(totals[c.key] ?? '')}</td>`).join('')}</tr></tfoot>` : ''
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr || `<tr><td colspan="${columns.length}" style="text-align:center;color:#8592a3">لا توجد بيانات</td></tr>`}</tbody>${tf}</table>`
}

export function openPrint(title, body, { auto = true } = {}) {
  const w = window.open('', '_blank')
  if (!w) { alert('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة للموقع'); return }
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet"><style>${CSS}</style></head>
  <body><div class="bar"><button onclick="print()">طباعة / حفظ PDF</button><button onclick="close()" style="background:#8592a3">إغلاق</button></div>
  ${body}<div class="foot"><span>${esc(title)}</span><span>طُبع في ${new Date().toLocaleString('en-GB')}</span></div></body></html>`)
  w.document.close()
  if (auto) w.onload = () => setTimeout(() => w.print(), 500)
}
