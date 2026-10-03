import type { WorkplaceBranding } from './workplaceBranding'
import { formatWorkplaceAddress, getClinicalExportBranding, getWorkplaceBranding } from './workplaceBranding'

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
  .letterhead { display: flex; align-items: flex-start; gap: 1rem; padding-bottom: 1rem; margin-bottom: 1.25rem; border-bottom: 2px solid #58c2d5; }
  .letterhead__logo { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
  .letterhead__org { font-size: 0.82rem; line-height: 1.45; color: #404b54; }
  .letterhead__org strong { display: block; font-size: 0.95rem; color: #1f2528; margin-bottom: 0.2rem; }
  .letterhead__org address { font-style: normal; white-space: pre-line; }
  h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
  .meta { font-size: 0.9rem; color: #555; margin: 0 0 1.25rem; }
  .content { font-size: 11pt; }
  .content p { margin: 0 0 0.75rem; }
  .content ul, .content ol { margin: 0 0 0.75rem 1.25rem; }
  @media print { body { margin: 1.25cm 1.5cm; } }
`

function buildLetterheadHtml(branding: WorkplaceBranding) {
  const address = formatWorkplaceAddress(branding)
  const logo = branding.logo_url
    ? `<img class="letterhead__logo" src="${branding.logo_url}" alt="${escapeHtml(branding.name)} logo" />`
    : ''
  return `<header class="letterhead">
    ${logo}
    <div class="letterhead__org">
      <strong>${escapeHtml(branding.name)}</strong>
      <address>${escapeHtml(address)}</address>
    </div>
  </header>`
}

function buildClinicalDocumentPrintHtml({
  title,
  metaHtml,
  bodyHtml,
  branding,
}: {
  title: string
  metaHtml: string
  bodyHtml: string
  branding: WorkplaceBranding
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${DOCUMENT_PRINT_STYLES}</style>
</head>
<body>
  ${buildLetterheadHtml(branding)}
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
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      cleanup()
      return
    }
    window.setTimeout(cleanup, 1000)
  }

  iframe.src = url
  return true
}

function noteToPlainBlock(note, profileName, branding?: WorkplaceBranding) {
  const date = note.session_date || note.created_at?.split('T')[0] || ''
  const modality = note.modality_used ? `\nModality: ${note.modality_used}` : ''
  const theme = note.therapeutic_theme ? `\nTheme: ${note.therapeutic_theme}` : ''
  const attachments = note.artwork_attachments?.length
    ? `\nArtwork attachments: ${note.artwork_attachments.map((a: { name?: string }) => a.name).join(', ')}`
    : ''
  const header = branding
    ? `${branding.name}\n${formatWorkplaceAddress(branding)}\n\n`
    : ''
  return `${header}${note.title}\nDate: ${date}\nAuthor: ${profileName || 'Clinician'}${modality}${theme}${attachments}\n\n${stripHtml(note.content)}`
}

function buildProgressNotePrintHtml(
  note,
  {
    clientName,
    authorName,
    branding,
  }: {
    clientName?: string
    authorName?: string
    branding?: WorkplaceBranding
  } = {},
) {
  const resolvedBranding = branding || getWorkplaceBranding(null)
  const sessionDate = note.session_date || note.created_at?.split('T')[0] || ''
  const modality = note.modality_used ? `<p><strong>Modality:</strong> ${escapeHtml(note.modality_used)}</p>` : ''
  const theme = note.therapeutic_theme
    ? `<p><strong>Therapeutic theme:</strong> ${escapeHtml(note.therapeutic_theme)}</p>`
    : ''
  const signed = note.status === 'signed_off' && note.signed_off_at
    ? `<p class="meta"><strong>Signed off:</strong> ${escapeHtml(new Date(note.signed_off_at).toLocaleString())}</p>`
    : ''

  const metaHtml = `<p class="meta">
    <strong>Client:</strong> ${escapeHtml(clientName || 'Client')}<br />
    <strong>Session date:</strong> ${escapeHtml(sessionDate)}<br />
    <strong>Author:</strong> ${escapeHtml(authorName || 'Clinician')}
  </p>${modality}${theme}${signed}`

  return buildClinicalDocumentPrintHtml({
    title: note.title,
    metaHtml,
    bodyHtml: note.content || '',
    branding: resolvedBranding,
  })
}

function buildLetterPrintHtml(
  letter,
  {
    clientName,
    authorName,
    branding,
  }: {
    clientName?: string
    authorName?: string
    branding?: WorkplaceBranding
  } = {},
) {
  const resolvedBranding = branding || getWorkplaceBranding(null)
  const letterDate = letter.letter_date || letter.created_at?.split('T')[0] || ''
  const metaHtml = `<p class="meta">
    ${letter.recipient ? `<strong>To:</strong> ${escapeHtml(letter.recipient)}<br />` : ''}
    <strong>Date:</strong> ${escapeHtml(letterDate)}<br />
    <strong>Re:</strong> ${escapeHtml(clientName || 'Client')}<br />
    <strong>Author:</strong> ${escapeHtml(authorName || 'Clinician')}
  </p>`

  return buildClinicalDocumentPrintHtml({
    title: letter.title,
    metaHtml,
    bodyHtml: letter.content || '',
    branding: resolvedBranding,
  })
}

/** Open a print-ready progress note — choose “Save as PDF” in the browser print dialog. */
export function downloadProgressNotePdf(
  note,
  meta: {
    clientName?: string
    authorName?: string
    workplaceId?: string | null
    clinicianUserId?: string | null
    branding?: WorkplaceBranding
  } = {},
) {
  if (!note) return false
  const branding = meta.branding || getClinicalExportBranding(meta.workplaceId, meta.clinicianUserId)
  const html = buildProgressNotePrintHtml(note, { ...meta, branding })
  return openPrintDocument(html)
}

/** Open a print-ready letter with workplace letterhead. */
export function downloadLetterPdf(
  letter,
  meta: {
    clientName?: string
    authorName?: string
    workplaceId?: string | null
    clinicianUserId?: string | null
    branding?: WorkplaceBranding
  } = {},
) {
  if (!letter) return false
  const branding = meta.branding || getClinicalExportBranding(meta.workplaceId, meta.clinicianUserId)
  const html = buildLetterPrintHtml(letter, { ...meta, branding })
  return openPrintDocument(html)
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
