import type { PrintLetterhead } from './letterheadPrint'
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
  html, body { margin: 0; padding: 0; background: #fff; }
  body { box-sizing: border-box; width: 794px; font-family: 'Karla', system-ui, sans-serif; color: #1a1818; padding: 1.75cm 2cm; line-height: 1.65; }
  .letterhead { margin: 0 0 1.25rem; }
  .letterhead__brand { width: 100%; border-collapse: collapse; margin: 0 0 0.85rem; }
  .letterhead__logo-cell { width: 88px; vertical-align: top; padding: 0 16px 0 0; }
  .letterhead__logo { width: 72px; height: 72px; object-fit: contain; display: block; }
  .letterhead__practice { vertical-align: top; text-align: right; }
  .letterhead__name { display: block; margin: 0 0 0.55rem; padding: 0; font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 22px; line-height: 1.3; color: #1f2528; }
  .letterhead__line { display: block; margin: 0; padding: 0; font-family: 'Karla', system-ui, sans-serif; font-size: 13px; line-height: 1.45; color: #404b54; }
  .letterhead__clinician, .letterhead__role { margin: 0.15rem 0 0; font-family: 'Karla', system-ui, sans-serif; font-size: 11pt; }
  .letterhead__rule { border: 0; border-top: 1px solid #1a1818; margin: 0.75rem 0 0; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 22px; line-height: 1.3; margin: 1rem 0 0.35rem; }
  .meta, .content { font-family: 'Karla', system-ui, sans-serif; }
  .meta { font-size: 0.9rem; color: #333; margin: 0 0 1.25rem; }
  .content { font-size: 11pt; }
  .content p { margin: 0 0 0.75rem; }
  .content ul, .content ol { margin: 0 0 0.75rem 1.25rem; }
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
  const name = practiceName
    ? `<div class="letterhead__name">${escapeHtml(practiceName)}</div>`
    : ''
  const address = lines.map((line) => `<div class="letterhead__line">${escapeHtml(line)}</div>`).join('')
  const practice = name || address
    ? `<td class="letterhead__practice">${name}${address}</td>`
    : ''
  const logoCell = logo ? `<td class="letterhead__logo-cell">${logo}</td>` : ''
  const brand = logoCell || practice
    ? `<table class="letterhead__brand"><tr>${logoCell}${practice}</tr></table>`
    : ''
  const clinician = clinicianName
    ? `<p class="letterhead__clinician">${escapeHtml(clinicianName)}</p>`
    : ''
  const role = professionalTitle
    ? `<p class="letterhead__role">${escapeHtml(professionalTitle)}</p>`
    : ''
  return `<header class="letterhead">${brand}${clinician}${role}<hr class="letterhead__rule" /></header>`
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
  <style>${DOCUMENT_PRINT_STYLES}</style>
</head>
<body>
  ${buildLetterheadHtml(letterhead)}
  <h1>${escapeHtml(title)}</h1>
  ${metaHtml}
  <div class="content">${bodyHtml || ''}</div>
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

async function inlineDocumentImages(doc: Document) {
  const images = [...doc.images]
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
}

function waitForFrame(iframe: HTMLIFrameElement, html: string) {
  return new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve()
    iframe.onerror = () => reject(new Error('Could not prepare the document'))
    iframe.srcdoc = html
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

async function waitForBrandFonts(doc: Document) {
  await doc.fonts?.ready
  await Promise.all([
    doc.fonts?.load('600 22px Fraunces'),
    doc.fonts?.load('16px Karla'),
  ].filter(Boolean))
}

/** Download a real PDF of the document. The file has no browser address or page chrome. */
async function downloadDocumentPdf(html: string, filename: string) {
  const [{ toCanvas }, { PDFDocument }] = await Promise.all([
    import('html-to-image'),
    import('pdf-lib'),
  ])
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Document export')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:0;top:0;width:${PDF_CSS_WIDTH}px;height:${Math.round(PDF_CSS_WIDTH * PDF_PAGE_HEIGHT / PDF_PAGE_WIDTH)}px;border:0;opacity:0;pointer-events:none;`
  document.body.appendChild(iframe)

  try {
    const fontCss = await embeddedBrandFontCss()
    const htmlWithFonts = html.replace('</style>', `${fontCss}</style>`)
    await waitForFrame(iframe, htmlWithFonts)
    const doc = iframe.contentDocument
    if (!doc?.body) throw new Error('Could not prepare the document')
    await waitForBrandFonts(doc)
    await inlineDocumentImages(doc)
    const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)
    iframe.style.height = `${height}px`
    const canvas = await toCanvas(doc.body, {
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
    iframe.remove()
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

export function renderProgressNoteDocument(
  note,
  {
    clientName,
    letterhead,
  }: {
    clientName?: string
    letterhead?: PrintLetterhead
  } = {},
) {
  return buildClinicalDocumentPrintHtml({
    title: note.title,
    metaHtml: noteMetaHtml(note, clientName),
    bodyHtml: note.content || '',
    letterhead,
  })
}

function buildLetterPrintHtml(
  letter,
  {
    clientName,
    letterhead,
  }: {
    clientName?: string
    letterhead?: PrintLetterhead
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
    bodyHtml: letter.content || '',
    letterhead,
  })
}

/** Download a Process Note as a PDF file. */
export async function downloadProgressNotePdf(
  note,
  meta: {
    clientName?: string
    letterhead?: PrintLetterhead
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
