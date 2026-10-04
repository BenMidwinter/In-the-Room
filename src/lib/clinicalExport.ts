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
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1818; margin: 1.75cm 2cm; line-height: 1.65; }
  .letterhead { margin: 0 0 1.25rem; }
  .letterhead__brand { display: flex; align-items: flex-start; gap: 1.25rem; }
  .letterhead__logo { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; }
  .letterhead__practice { margin-left: auto; text-align: right; }
  .letterhead__practice strong { display: block; font-size: 1.35rem; line-height: 1.2; color: #1f2528; }
  .letterhead__practice address { font-style: normal; font-size: 0.85rem; line-height: 1.4; color: #404b54; margin-top: 0.3rem; }
  .letterhead__clinician, .letterhead__role { margin: 0.15rem 0 0; font-size: 11pt; }
  .letterhead__rule { border: 0; border-top: 1px solid #1a1818; margin: 0.75rem 0 0; }
  h1 { font-size: 1.35rem; margin: 1rem 0 0.35rem; }
  .meta { font-size: 0.9rem; color: #333; margin: 0 0 1.25rem; }
  .content { font-size: 11pt; }
  .content p { margin: 0 0 0.75rem; }
  .content ul, .content ol { margin: 0 0 0.75rem 1.25rem; }
  @media print { body { margin: 1.25cm 1.5cm; } }
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
    ? `<img class="letterhead__logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(practiceName || 'Practice logo')}" />`
    : ''
  const address = lines.length
    ? `<address>${lines.map((line) => escapeHtml(line)).join('<br />')}</address>`
    : ''
  const practice = practiceName || address
    ? `<div class="letterhead__practice">${practiceName ? `<strong>${escapeHtml(practiceName)}</strong>` : ''}${address}</div>`
    : ''
  const brand = logo || practice ? `<div class="letterhead__brand">${logo}${practice}</div>` : ''
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

function openPrintDocument(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Document export')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)

  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    URL.revokeObjectURL(url)
    iframe.remove()
  }

  iframe.onerror = () => {
    cleanup()
  }

  iframe.onload = () => {
    const print = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        cleanup()
        return
      }
      window.setTimeout(cleanup, 1000)
    }

    const images = [...(iframe.contentDocument?.images || [])].filter((img) => !img.complete)
    if (!images.length) {
      print()
      return
    }

    let pending = images.length
    let printed = false
    const finish = () => {
      if (printed) return
      printed = true
      print()
    }
    const done = () => {
      pending -= 1
      if (pending <= 0) finish()
    }
    window.setTimeout(finish, 4000)
    for (const img of images) {
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    }
  }

  iframe.src = url
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

/** Open a print-ready Process Note — choose “Save as PDF” in the browser print dialog. */
export function downloadProgressNotePdf(
  note,
  meta: {
    clientName?: string
    letterhead?: PrintLetterhead
  } = {},
) {
  if (!note) return false
  return openPrintDocument(renderProgressNoteDocument(note, meta))
}

/** Open a print-ready letter with the chosen practice letterhead. */
export function downloadLetterPdf(
  letter,
  meta: {
    clientName?: string
    letterhead?: PrintLetterhead
  } = {},
) {
  if (!letter) return false
  return openPrintDocument(buildLetterPrintHtml(letter, meta))
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
