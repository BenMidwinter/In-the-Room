// supabase/functions/_shared/emailTemplate.ts
import { secret } from './secrets.ts'

/**
 * Process&Note — Practice Linen Design Tokens (resolved for email clients)
 * Mirrors base.css & tokens.css without relying on CSS custom properties.
 */
export const EMAIL_THEME = {
  bgPage: '#f6f3ec',        // Warm practice linen canvas
  bgSurface: '#fffdf9',     // Elevated paper card
  bgSubtle: '#efeae0',      // Subtle callout / metadata box
  borderColor: '#dcd5c7',   // Card & table border
  borderLight: '#e8e2d5',   // Hairline divider
  txtBody: '#2b2926',       // Primary ink
  txtMuted: '#68635b',      // Secondary / hint text
  colAccent: '#1e2f26',     // Deep forest heading ink
  colPrimary: '#2f5d46',    // Primary forest green
  colPrimaryDark: '#234735',// Darker forest gradient stop
  fontHead: "'Fraunces', Georgia, 'Times New Roman', serif",
  fontBody: "'Karla', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const

export type EmailSection = {
  label: string
  value: string
}

export type EmailTemplateOptions = {
  /** Short hidden preview text shown in the inbox list before opening */
  preheader?: string
  /** Small uppercase eyebrow above the main heading (e.g. "DATA EXPORT", "INVOICE") */
  eyebrow?: string
  /** Main Fraunces H1 heading */
  heading: string
  /** Array of body paragraphs (plain text is escaped; pass rawBodyHtml for custom markup) */
  paragraphs?: string[]
  /** Optional key-value summary box (e.g. Amount Due, Due Date, Scope) */
  details?: EmailSection[]
  /** Optional callout / custom note (renders with a 4px left accent bar like .app-toast) */
  callout?: string
  /** Optional primary call-to-action button */
  cta?: {
    label: string
    url: string
  }
  /** Optional raw HTML injected inside the card body */
  rawBodyHtml?: string
  /** Optional footer note explaining why the recipient received this email */
  footerNote?: string
  /** Optional override for SITE_URL (defaults to Edge Function SITE_URL secret) */
  siteUrl?: string
}

export function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function resolveLogoUrl(siteUrl?: string): string {
  const base = (siteUrl || secret('SITE_URL') || 'https://processandnote.app').replace(/\/+$/, '')
  return `${base}/brand/process-note-logo.png`
}

/**
 * Master HTML + Plain-Text email renderer for Process&Note.
 */
export function renderEmailTemplate(opts: EmailTemplateOptions): { html: string; text: string } {
  const logoUrl = resolveLogoUrl(opts.siteUrl)
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : escapeHtml(opts.heading)

  const paragraphsHtml = (opts.paragraphs || [])
    .map(
      (p) =>
        `<p style="margin: 0 0 16px 0; font-family: ${EMAIL_THEME.fontBody}; font-size: 16px; line-height: 1.6; color: ${EMAIL_THEME.txtBody};">${escapeHtml(p).replaceAll('\n', '<br>')}</p>`,
    )
    .join('\n')

  const detailsHtml = opts.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: ${EMAIL_THEME.bgSubtle}; border: 1px solid ${EMAIL_THEME.borderLight}; border-radius: 6px;">
        <tbody>
          ${opts.details
            .map(
              (row, i) => `
            <tr>
              <td style="padding: 10px 16px; font-family: ${EMAIL_THEME.fontBody}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: ${EMAIL_THEME.txtMuted}; border-bottom:${i < opts.details!.length - 1 ? `1px solid ${EMAIL_THEME.borderLight}` : 'none'}; width: 38%;">
                ${escapeHtml(row.label)}
              </td>
              <td style="padding: 10px 16px; font-family: ${EMAIL_THEME.fontBody}; font-size: 15px; font-weight: 600; color: ${EMAIL_THEME.colAccent}; border-bottom:${i < opts.details!.length - 1 ? `1px solid ${EMAIL_THEME.borderLight}` : 'none'};">
                ${escapeHtml(row.value)}
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
    : ''

  const calloutHtml = opts.callout
    ? `<div style="margin: 20px 0; padding: 14px 16px; background-color: ${EMAIL_THEME.bgPage}; border: 1px solid ${EMAIL_THEME.borderColor}; border-left: 4px solid ${EMAIL_THEME.colPrimary}; font-family: ${EMAIL_THEME.fontBody}; font-size: 15px; line-height: 1.55; color: ${EMAIL_THEME.txtBody};">
        ${escapeHtml(opts.callout).replaceAll('\n', '<br>')}
      </div>`
    : ''

  const ctaHtml = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 26px 0 10px 0;">
        <tr>
          <td align="center" bgcolor="${EMAIL_THEME.colPrimary}" style="border-radius: 6px; background-color: ${EMAIL_THEME.colPrimary};">
            <a href="${escapeHtml(opts.cta.url)}" target="_blank" style="display: inline-block; padding: 13px 24px; font-family: ${EMAIL_THEME.fontBody}; font-size: 15px; font-weight: 700; color: #fffdf9; text-decoration: none; border-radius: 6px;">
              ${escapeHtml(opts.cta.label)}
            </a>
          </td>
        </tr>
      </table>`
    : ''

  const footerText =
    opts.footerNote ||
    'Sent by Process&Note · Clinical documentation for creative arts therapists.'

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.heading)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Karla:wght@400;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_THEME.bgPage}; font-family: ${EMAIL_THEME.fontBody}; color: ${EMAIL_THEME.txtBody}; -webkit-font-smoothing: antialiased;">
  <!-- Hidden inbox preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: ${EMAIL_THEME.bgPage};">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${EMAIL_THEME.bgPage}" style="background-color: ${EMAIL_THEME.bgPage}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main 560px container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%;">
          
          <!-- Centred Logo Heading -->
          <tr>
            <td align="center" style="padding: 0 0 24px 0; text-align: center;">
              <img
                src="${escapeHtml(logoUrl)}"
                alt="Process&amp;Note"
                width="280"
                style="display: block; margin: 0 auto; max-width: 280px; width: 280px; height: auto; border: 0; outline: none; text-decoration: none;"
              />
            </td>
          </tr>

          <!-- Paper Card Surface -->
          <tr>
            <td bgcolor="${EMAIL_THEME.bgSurface}" style="background-color: ${EMAIL_THEME.bgSurface}; border: 1px solid ${EMAIL_THEME.borderColor}; border-top: 4px solid ${EMAIL_THEME.colPrimary}; border-radius: 8px; padding: 32px 28px; box-shadow: 0 4px 14px rgba(30, 47, 38, 0.05);">
              ${
                opts.eyebrow
                  ? `<p style="margin: 0 0 6px 0; font-family: ${EMAIL_THEME.fontBody}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${EMAIL_THEME.colPrimary};">${escapeHtml(opts.eyebrow)}</p>`
                  : ''
              }
              <h1 style="margin: 0 0 18px 0; font-family: ${EMAIL_THEME.fontHead}; font-size: 24px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; color: ${EMAIL_THEME.colAccent};">
                ${escapeHtml(opts.heading)}
              </h1>

              ${paragraphsHtml}
              ${detailsHtml}
              ${calloutHtml}
              ${opts.rawBodyHtml || ''}
              ${ctaHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 20px 16px 0 16px; text-align: center;">
              <p style="margin: 0; font-family: ${EMAIL_THEME.fontBody}; font-size: 13px; line-height: 1.5; color: ${EMAIL_THEME.txtMuted};">
                ${escapeHtml(footerText)}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  // Plain-text fallback for accessibility & spam-score health
  const textParts: string[] = ['Process&Note', '']
  if (opts.eyebrow) textParts.push(opts.eyebrow.toUpperCase())
  textParts.push(opts.heading, '')
  for (const p of opts.paragraphs || []) textParts.push(p, '')
  if (opts.details?.length) {
    for (const d of opts.details) textParts.push(`${d.label}: ${d.value}`)
    textParts.push('')
  }
  if (opts.callout) textParts.push(opts.callout, '')
  if (opts.cta) textParts.push(`${opts.cta.label}: ${opts.cta.url}`, '')
  textParts.push('---', footerText)

  return { html, text: textParts.join('\n') }
}

/* ── Concrete Email Builders ───────────────────────────────────────────── */

/** 1. One-time Data Export Ready Email */
export function buildExportReadyEmail(params: {
  scopeLabel: string
  downloadUrl: string
  expiresHours?: number
  siteUrl?: string
}) {
  const hours = params.expiresHours ?? 24
  return renderEmailTemplate({
    siteUrl: params.siteUrl,
    preheader: `Your ${params.scopeLabel} export is ready to download.`,
    eyebrow: 'Data Export',
    heading: 'Your export is ready',
    paragraphs: [
      `The ${params.scopeLabel} export you requested has been prepared and sealed in a single .zip archive.`,
      `Use the button below to open the download page. This link works once and expires in ${hours} hours.`,
    ],
    details: [
      { label: 'Export scope', value: params.scopeLabel },
      { label: 'Link validity', value: `Single use · ${hours} hours` },
    ],
    cta: {
      label: 'Open download page',
      url: params.downloadUrl,
    },
    footerNote:
      'For your security, this link was sent only to your registered Process&Note account email.',
  })
}

/** 2. Client / Payer Invoice Email */
export function buildInvoiceEmail(params: {
  invoiceNumber: string
  billToName: string
  forName?: string
  amountFormatted: string
  dueDateFormatted?: string
  customNote?: string
  paymentInstructions: string
  clinicianName?: string
  siteUrl?: string
}) {
  const who =
    params.forName && params.forName !== params.billToName
      ? `${params.billToName} (${params.forName})`
      : params.billToName

  const details: EmailSection[] = [
    { label: 'Invoice', value: params.invoiceNumber },
    { label: 'Addressed to', value: who },
    { label: 'Amount due', value: params.amountFormatted },
  ]
  if (params.dueDateFormatted) {
    details.push({ label: 'Due date', value: params.dueDateFormatted })
  }

  return renderEmailTemplate({
    siteUrl: params.siteUrl,
    preheader: `Invoice ${params.invoiceNumber} (${params.amountFormatted})`,
    eyebrow: 'Invoice',
    heading: `Invoice ${params.invoiceNumber}`,
    paragraphs: [
      `Hello ${params.billToName},`,
      `Please find your invoice details below${params.clinicianName ? ` from ${params.clinicianName}` : ''}.`,
      ...(params.customNote ? [params.customNote] : []),
    ],
    details,
    callout: `How to pay:\n${params.paymentInstructions}`,
  })
}
