import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { userClient } from '../_shared/supabaseAdmin.ts'

const BATCH_LIMIT = 100

type InvoiceRow = {
  id: string
  number: string
  status: string
  bill_to_name: string
  bill_to_email: string
  for_name: string
  total_pence: number
  due_on: string | null
  payment_details: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const key = Deno.env.get('RESEND_API_KEY') || ''
    const from = Deno.env.get('RESEND_FROM_EMAIL') || ''
    const connected = Boolean(key && from)
    if (body.action === 'probe') return jsonResponse({ email: connected })
    if (!connected) return jsonResponse({ email: false, error: 'Email is not connected yet.' }, 400)

    const invoiceIds = Array.isArray(body.invoiceIds) ? body.invoiceIds.filter((id) => typeof id === 'string') : []
    if (!invoiceIds.length) return jsonResponse({ error: 'Choose at least one invoice.' }, 400)
    if (invoiceIds.length > BATCH_LIMIT) {
      return jsonResponse({ error: 'Send at most 100 invoices at a time.' }, 400)
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('id, number, status, bill_to_name, bill_to_email, for_name, total_pence, due_on, payment_details')
      .in('id', invoiceIds)
    if (error) return jsonResponse({ error: error.message }, 400)

    const { data: profile } = await supabase
      .from('profiles')
      .select('invoice_account_name, invoice_sort_code, invoice_account_number, invoice_payment_note')
      .eq('id', user.id)
      .maybeSingle()
    const paymentText = paymentInstructions(profile)
    if (!paymentText) {
      return jsonResponse({ error: 'Add payment details in Account settings before you send these.' }, 400)
    }

    const note = String(body.customNote || '').trim().slice(0, 2000)
    const ready: InvoiceRow[] = []
    const failed: Array<{ id: string; reason: string }> = []
    for (const invoice of (data || []) as InvoiceRow[]) {
      if (invoice.status !== 'draft') {
        failed.push({ id: invoice.id, reason: 'This invoice is not a draft.' })
        continue
      }
      if (!String(invoice.bill_to_email || '').trim()) {
        failed.push({ id: invoice.id, reason: 'No email address on file.' })
        continue
      }
      ready.push(invoice)
    }

    if (!ready.length) return jsonResponse({ email: true, batchId: null, sent: [], failed })

    const batchId = crypto.randomUUID()
    const messages = ready.map((invoice) => {
      const message: {
        from: string
        to: string[]
        reply_to?: string
        subject: string
        html: string
      } = {
        from,
        to: emailList(invoice.bill_to_email),
        subject: `Invoice ${invoice.number}`,
        html: invoiceHtml(invoice, note, paymentText),
      }
      if (user.email) message.reply_to = user.email
      return message
    })
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': batchId,
      },
      body: JSON.stringify(messages),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = String(payload?.message || payload?.error || 'Email provider rejected this batch.')
      for (const invoice of ready) failed.push({ id: invoice.id, reason })
      return jsonResponse({ email: true, batchId, sent: [], failed })
    }
    return jsonResponse({
      email: true,
      batchId: String(payload?.id || batchId),
      sent: ready.map((invoice) => ({ id: invoice.id })),
      failed,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send invoices.'
    return jsonResponse({ error: message }, 500)
  }
})

function emailList(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

function paymentInstructions(profile: {
  invoice_account_name?: string | null
  invoice_sort_code?: string | null
  invoice_account_number?: string | null
  invoice_payment_note?: string | null
} | null): string {
  if (!profile) return ''
  const lines = []
  if (profile.invoice_account_name?.trim()) lines.push(profile.invoice_account_name.trim())
  if (profile.invoice_sort_code?.trim()) lines.push(`Sort code ${profile.invoice_sort_code.trim()}`)
  if (profile.invoice_account_number?.trim()) lines.push(`Account number ${profile.invoice_account_number.trim()}`)
  if (profile.invoice_payment_note?.trim()) lines.push(profile.invoice_payment_note.trim())
  return lines.join('\n')
}

function invoiceHtml(invoice: InvoiceRow, note: string, paymentText: string): string {
  const who = invoice.for_name && invoice.for_name !== invoice.bill_to_name
    ? `${invoice.bill_to_name} (${invoice.for_name})`
    : invoice.bill_to_name
  const lines = [
    `<p>Invoice <strong>${escapeHtml(invoice.number)}</strong> for ${escapeHtml(who)}.</p>`,
    `<p>Amount due: ${escapeHtml(formatPence(invoice.total_pence))}</p>`,
  ]
  if (note) lines.push(`<p>${escapeHtml(note)}</p>`)
  if (paymentText) lines.push(`<p>How to pay:</p><p>${escapeHtml(paymentText).replaceAll('\n', '<br>')}</p>`)
  return lines.join('')
}

function formatPence(pence: number): string {
  const amount = Math.max(0, Math.trunc(Number(pence) || 0))
  const pounds = Math.floor(amount / 100)
  const rest = String(amount % 100).padStart(2, '0')
  return `£${pounds}.${rest}`
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
