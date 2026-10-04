import type { PrintLetterhead } from './letterheadPrint'
import { fillMergeFields } from './mergeFields'
import type { WorkplaceBranding } from './workplaceBranding'
import { formatWorkplaceAddress, getClinicalExportBranding } from './workplaceBranding'

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const DOCUMENT_PRINT_STYLES = `
  .clinical-pdf { box-sizing: border-box; width: 794px; margin: 0; background: #fff; font-family: 'Karla', system-ui, sans-serif; color: #1a1818; padding: 1.75cm 2cm; line-height: 1.65; }
  .clinical-pdf * { box-sizing: border-box; }
  .clinical-pdf .letterhead { margin: 0 0 1rem; }
  .clinical-pdf .letterhead__brand { width: 100%; border-collapse: collapse; margin: 0; }
  .clinical-pdf .letterhead__identity { width: 46%; vertical-align: top; text-align: left; padding: 0 18px 0 0; }
  .clinical-pdf .letterhead__logo { width: 64px; height: 64px; object-fit: contain; display: block; margin: 0 0 0.4rem; }
  .clinical-pdf .letterhead__clinician,
  .clinical-pdf .letterhead__role { display: block; margin: 0; padding: 0; font-family: 'Karla', system-ui, sans-serif; font-size: 11pt; line-height: 1.35; color: #1a1818; }
  .clinical-pdf .letterhead__role { color: #404b54; }
  .clinical-pdf .letterhead__practice { vertical-align: top; text-align: right; }
  .clinical-pdf .letterhead__name { display: block; margin: 0 0 0.3rem; padding: 0; font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 26px; line-height: 1.15; color: #1f2528; }
  .clinical-pdf .letterhead__line { display: block; margin: 0; padding: 0; font-family: 'Karla', system-ui, sans-serif; font-size: 12px; line-height: 1.35; color: #404b54; }
  .clinical-pdf .letterhead__rule { border: 0; border-top: 1px solid #1a1818; margin: 0.55rem 0 0; }
  .clinical-pdf h1, .clinical-pdf h2, .clinical-pdf h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; color: #1a1818; letter-spacing: -0.02em; }
  .clinical-pdf h1 { font-size: 22px; line-height: 1.3; margin: 1rem 0 0.35rem; }
  .clinical-pdf h2 { font-size: 16px; line-height: 1.3; margin: 1rem 0 0.3rem; }
  .clinical-pdf h3 { font-size: 13px; line-height: 1.35; margin: 0.85rem 0 0.25rem; }
  .clinical-pdf blockquote { margin: 0.75rem 0; padding: 0 0 0 0.7rem; border-left: 2px solid #1a1818; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 13pt; line-height: 1.45; }
  .clinical-pdf .expr-size--voice, .clinical-pdf .expr-size--loud { font-family: 'Fraunces', Georgia, serif; font-style: italic; }
  .clinical-pdf .expr-size--voice::before, .clinical-pdf .expr-size--loud::before { content: "“"; }
  .clinical-pdf .expr-size--voice::after, .clinical-pdf .expr-size--loud::after { content: "”"; }
  .clinical-pdf .expr-size--aside, .clinical-pdf .expr-size--fluid { font-style: italic; color: #5c656c; }
  .clinical-pdf .expr-size--land, .clinical-pdf .expr-size--bold-bright { font-family: 'Fraunces', Georgia, serif; font-weight: 600; }
  .clinical-pdf .expr-hl--yellow-soft, .clinical-pdf .expr-hl--neon-lime { background: #f4e7b8; }
  .clinical-pdf .expr-hl--sage-wash { background: #e4eadf; }
  .clinical-pdf .expr-hl--clay-wash, .clinical-pdf .expr-hl--pink-soft, .clinical-pdf .expr-hl--neon-magenta { background: #f3e4dc; }
  .clinical-pdf .merge-field { background: #e7f3ef; padding: 0 0.15em; border-radius: 0.15em; }
  .clinical-pdf .meta,
  .clinical-pdf .clinical-pdf__body { font-family: 'Karla', system-ui, sans-serif; color: #1a1818; }
  .clinical-pdf .meta { font-size: 0.9rem; margin: 0 0 1.1rem; }
  .clinical-pdf .clinical-pdf__body { display: block; font-size: 11pt; }
  .clinical-pdf .clinical-pdf__body p { margin: 0 0 0.75rem; }
  .clinical-pdf .clinical-pdf__body ul,
  .clinical-pdf .clinical-pdf__body ol { margin: 0 0 0.75rem 1.25rem; }
  .clinical-pdf .addendum { margin-top: 1.25rem; padding-top: 0.75rem; border-top: 1px solid #c8c2b8; }
  .clinical-pdf .addendum__label { margin: 0 0 0.4rem; font-size: 0.85rem; color: #404b54; }
  .clinical-pdf .clinical-pdf__body hr { border: none; border-top: 1px solid #c8c2b8; margin: 1rem 0; }
  .clinical-pdf .doc-signature { margin-top: 1.25rem; color: #1a1818; }
  .clinical-pdf .doc-signature__image { display: block; max-height: 3.5rem; max-width: 14rem; object-fit: contain; margin-bottom: 0.35rem; }
  .clinical-pdf .doc-signature__script { font-family: 'Caveat', cursive; font-size: 28px; line-height: 1.15; margin-bottom: 0.2rem; }
  .clinical-pdf .doc-signature__name { font-weight: 600; }
`

function formatPrintDate(value: string | undefined) {
  if (!value) return ''
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatPrintDateTime(value: string | undefined) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildLetterheadHtml(letterhead?: PrintLetterhead) {
  const practiceName = letterhead?.practiceName?.trim() || ''
  const logoUrl = letterhead?.logoUrl?.trim() || ''
  const lines = (letterhead?.addressLines || []).map((line) => line.trim()).filter(Boolean)
  const clinicianName = letterhead?.clinicianName?.trim() || ''
  const professionalTitle = letterhead?.professionalTitle?.trim() || ''
  const logo = logoUrl
    ? `<img class="letterhead__logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(practiceName || 'Practice logo')}" crossorigin="anonymous" />`
    : ''
  const clinician = clinicianName
    ? `<div class="letterhead__clinician">${escapeHtml(clinicianName)}</div>`
    : ''
  const role = professionalTitle
    ? `<div class="letterhead__role">${escapeHtml(professionalTitle)}</div>`
    : ''
  const identity = logo || clinician || role
    ? `<td class="letterhead__identity">${logo}${clinician}${role}</td>`
    : ''
  const name = practiceName
    ? `<div class="letterhead__name">${escapeHtml(practiceName)}</div>`
    : ''
  const address = lines.map((line) => `<div class="letterhead__line">${escapeHtml(line)}</div>`).join('')
  const practice = name || address
    ? `<td class="letterhead__practice">${name}${address}</td>`
    : ''
  const brand = identity || practice
    ? `<table class="letterhead__brand"><tr>${identity}${practice}</tr></table>`
    : ''
  return `<header class="letterhead">${brand}<hr class="letterhead__rule" /></header>`
}

function buildClinicalDocumentPrintHtml({
  title,
  metaHtml,
  bodyHtml,
  letterhead,
}: {
  title: string
  metaHtml: string
  bodyHtml: string
  letterhead?: PrintLetterhead
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    ${DOCUMENT_PRINT_STYLES}
  </style>
</head>
<body>
  <div class="clinical-pdf">
    ${buildLetterheadHtml(letterhead)}
    <h1>${escapeHtml(title)}</h1>
    ${metaHtml}
    <div class="clinical-pdf__body">${bodyHtml || ''}</div>
  </div>
</body>
</html>`
}

const PDF_PAGE_WIDTH = 595.28
const PDF_PAGE_HEIGHT = 841.89
const PDF_CSS_WIDTH = 794

function pdfFilename(title: string | undefined) {
  const safe = String(title || 'document')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `${safe || 'document'}.pdf`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function embeddedBrandFontCss() {
  const [{ default: fraunces600 }, { default: karla400 }, { default: karla700 }] = await Promise.all([
    import('@fontsource/fraunces/files/fraunces-latin-600-normal.woff2?url'),
    import('@fontsource/karla/files/karla-latin-400-normal.woff2?url'),
    import('@fontsource/karla/files/karla-latin-700-normal.woff2?url'),
  ])
  const faces = [
    { family: 'Fraunces', weight: 600, url: fraunces600 },
    { family: 'Karla', weight: 400, url: karla400 },
    { family: 'Karla', weight: 700, url: karla700 },
  ]
  const rules = await Promise.all(faces.map(async (face) => {
    const response = await fetch(face.url)
    if (!response.ok) throw new Error('Could not load the document fonts')
    const dataUrl = await blobToDataUrl(await response.blob())
    return `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};src:url(${dataUrl}) format('woff2');}`
  }))
  return rules.join('\n')
}

async function waitForBrandFonts() {
  await document.fonts?.ready
  await Promise.all([
    document.fonts?.load("600 26px Fraunces"),
    document.fonts?.load('16px Karla'),
    document.fonts?.load('28px Caveat'),
  ].filter(Boolean))
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

/** Download a real PDF of the document. The file has no browser address or page chrome. */
async function downloadDocumentPdf(html: string, filename: string) {
  const [{ toCanvas }, { PDFDocument }] = await Promise.all([
    import('html-to-image'),
    import('pdf-lib'),
  ])
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const sheet = parsed.querySelector('.clinical-pdf')
  if (!sheet) throw new Error('Could not prepare the document')

  const fontCss = await embeddedBrandFontCss()
  const style = document.createElement('style')
  style.setAttribute('data-clinical-pdf', 'true')
  style.textContent = `${DOCUMENT_PRINT_STYLES}\n${fontCss}`
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:0;top:0;width:${PDF_CSS_WIDTH}px;z-index:-1;pointer-events:none;background:#fff;`
  host.appendChild(document.importNode(sheet, true))
  document.head.appendChild(style)
  document.body.appendChild(host)

  try {
    await waitForBrandFonts()
    const images = [...host.querySelectorAll('img')]
    await Promise.all(images.map(async (img) => {
      const src = img.getAttribute('src') || ''
      if (!src || src.startsWith('data:')) return
      try {
        const response = await fetch(src)
        if (!response.ok) throw new Error('Logo could not be loaded')
        img.src = await blobToDataUrl(await response.blob())
        if (img.decode) await img.decode()
      } catch {
        img.remove()
      }
    }))
    await nextFrame()
    const target = host.querySelector('.clinical-pdf')
    if (!target) throw new Error('Could not prepare the document')
    const height = Math.max(target.scrollHeight, target.getBoundingClientRect().height)
    const canvas = await toCanvas(target as HTMLElement, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width: PDF_CSS_WIDTH,
      height,
      fontEmbedCSS: fontCss,
    })
    const pdf = await PDFDocument.create()
    const pageSlicePx = Math.floor(canvas.width * (PDF_PAGE_HEIGHT / PDF_PAGE_WIDTH))
    for (let y = 0; y < canvas.height; y += pageSlicePx) {
      const sliceHeight = Math.min(pageSlicePx, canvas.height - y)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceHeight
      const context = slice.getContext('2d')
      if (!context) throw new Error('Could not prepare the document')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, slice.width, slice.height)
      context.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      const pngBytes = await fetch(slice.toDataURL('image/png')).then((response) => response.arrayBuffer())
      const image = await pdf.embedPng(pngBytes)
      const page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
      const drawHeight = (sliceHeight / canvas.width) * PDF_PAGE_WIDTH
      page.drawImage(image, {
        x: 0,
        y: PDF_PAGE_HEIGHT - drawHeight,
        width: PDF_PAGE_WIDTH,
        height: drawHeight,
      })
    }
    const bytes = await pdf.save()
    const copy = new Uint8Array(bytes)
    downloadBlob(filename, new Blob([copy], { type: 'application/pdf' }))
  } finally {
    host.remove()
    style.remove()
  }
  return true
}

function noteToPlainBlock(note, profileName, branding?: WorkplaceBranding) {
  const date = note.session_date || note.created_at?.split('T')[0] || ''
  const header = branding
    ? `${branding.name}\n${formatWorkplaceAddress(branding)}\n\n`
    : ''
  const author = profileName ? `\nAuthor: ${profileName}` : ''
  return `${header}${note.title}\nDate: ${date}${author}\n\n${stripHtml(note.content)}`
}

function addendumSectionHtml(addendums) {
  if (!Array.isArray(addendums) || addendums.length === 0) return ''
  return addendums.map((item) => {
    const when = item?.created_at ? formatPrintDateTime(item.created_at) : ''
    const label = when ? `Addendum · ${when}` : 'Addendum'
    return `<section class="addendum"><p class="addendum__label">${escapeHtml(label)}</p><div class="clinical-pdf__body">${item?.body || ''}</div></section>`
  }).join('')
}

function noteMetaHtml(note, clientName?: string) {
  const sessionDate = note.session_date || note.created_at?.split('T')[0] || ''
  const dateLabel = formatPrintDate(sessionDate)
  const signed = note.status === 'signed_off' && note.signed_off_at
    ? `<br /><strong>Signed off:</strong> ${escapeHtml(formatPrintDateTime(note.signed_off_at))}`
    : ''
  return `<p class="meta">
    ${clientName ? `<strong>Client:</strong> ${escapeHtml(clientName)}<br />` : ''}
    ${dateLabel ? `<strong>Date:</strong> ${escapeHtml(dateLabel)}` : ''}
    ${signed}
  </p>`
}

function withMergeFields(html, mergeContext) {
  if (!mergeContext) return html || ''
  return fillMergeFields(html || '', mergeContext, 'document')
}

export function renderProgressNoteDocument(
  note,
  {
    clientName,
    letterhead,
    mergeContext,
  }: {
    clientName?: string
    letterhead?: PrintLetterhead
    mergeContext?: Record<string, string>
  } = {},
) {
  const addendums = mergeContext
    ? (note.addendums || []).map((item) => ({ ...item, body: withMergeFields(item.body, mergeContext) }))
    : note.addendums
  return buildClinicalDocumentPrintHtml({
    title: note.title,
    metaHtml: noteMetaHtml(note, clientName),
    bodyHtml: `${withMergeFields(note.content, mergeContext)}${addendumSectionHtml(addendums)}`,
    letterhead,
  })
}

function buildLetterPrintHtml(
  letter,
  {
    clientName,
    letterhead,
    mergeContext,
  }: {
    clientName?: string
    letterhead?: PrintLetterhead
    mergeContext?: Record<string, string>
  } = {},
) {
  const letterDate = letter.letter_date || letter.created_at?.split('T')[0] || ''
  const dateLabel = formatPrintDate(letterDate)
  const metaHtml = `<p class="meta">
    ${dateLabel ? `<strong>Date:</strong> ${escapeHtml(dateLabel)}<br />` : ''}
    ${letter.recipient ? `<strong>To:</strong> ${escapeHtml(letter.recipient)}<br />` : ''}
    ${clientName ? `<strong>Re:</strong> ${escapeHtml(clientName)}` : ''}
  </p>`

  return buildClinicalDocumentPrintHtml({
    title: letter.title,
    metaHtml,
    bodyHtml: withMergeFields(letter.content, mergeContext),
    letterhead,
  })
}

/** Download a Process Note as a PDF file. */
export async function downloadProgressNotePdf(
  note,
  meta: {
    clientName?: string
    letterhead?: PrintLetterhead
    mergeContext?: Record<string, string>
  } = {},
) {
  if (!note) return false
  return downloadDocumentPdf(renderProgressNoteDocument(note, meta), pdfFilename(note.title))
}

/** Download a letter as a PDF file. */
export async function downloadLetterPdf(
  letter,
  meta: {
    clientName?: string
    letterhead?: PrintLetterhead
    mergeContext?: Record<string, string>
  } = {},
) {
  if (!letter) return false
  return downloadDocumentPdf(buildLetterPrintHtml(letter, meta), pdfFilename(letter.title))
}

/** Mock batch export — resolves after delay with a browser download. */
export function exportClinicalNotes(
  notes,
  {
    format,
    clientName,
    getAuthorName,
    workplaceId = null,
    clinicianUserId = null,
  }: {
    format: string
    clientName?: string
    getAuthorName?: (authorId: string) => string | undefined
    workplaceId?: string | null
    clinicianUserId?: string | null
  },
) {
  const safeName = (clientName || 'client').replace(/\s+/g, '-').toLowerCase()
  const timestamp = new Date().toISOString().split('T')[0]
  const branding = getClinicalExportBranding(workplaceId, clinicianUserId)

  return new Promise((resolve) => {
    setTimeout(() => {
      if (format === 'combined-pdf') {
        const body = notes.map((n: { author_id?: string }) =>
          noteToPlainBlock(n, getAuthorName?.(n.author_id || ''), branding),
        ).join('\n\n---\n\n')
        const header = `${branding.name}\n${formatWorkplaceAddress(branding)}\n\nIn the Room Clinical Record — ${clientName || 'Client'}\nExported: ${timestamp}\nNotes: ${notes.length}\n\n`
        downloadBlob(
          `${safeName}-clinical-record-${timestamp}.pdf`,
          new Blob([header + body], { type: 'application/pdf' }),
        )
      } else {
        const manifest = notes.map((n: { title?: string; author_id?: string }, i: number) => {
          const block = noteToPlainBlock(n, getAuthorName?.(n.author_id || ''), branding)
          return `=== FILE ${i + 1}: ${String(n.title || 'note').replace(/[^\w\s-]/g, '')}.txt ===\n${block}`
        }).join('\n\n')
        downloadBlob(
          `${safeName}-notes-batch-${timestamp}.zip`,
          new Blob([manifest], { type: 'application/zip' }),
        )
      }
      resolve(undefined)
    }, 1800)
  })
}
