import { getSupabase } from './client'
import { dueDateFrom, formatInvoiceNumber, invoiceTotalPence, paymentInstructions, sequenceFromInvoiceNumber, EMPTY_PAYMENT } from '../invoices'
import type { InvoiceLine, InvoiceLineInput, InvoiceRecord, InvoiceStatus, PaymentDetails } from '../invoices'
import { todayYmd } from '../dateArchitecture'

type InvoiceRow = {
  id: string
  client_id: string | null
  number: string
  status: InvoiceStatus
  issued_on: string | null
  due_on: string | null
  bill_to_name: string
  payment_details: string
  total_pence: number
}

type LineRow = {
  id: string
  invoice_id: string
  appointment_id: string | null
  position: number
  description: string
  session_date: string | null
  unit_pence: number
  includes_vat: boolean
  released_at: string | null
}

function mapLine(row: LineRow): InvoiceLine {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    description: row.description,
    sessionDate: row.session_date,
    unitPence: row.unit_pence,
    includesVat: row.includes_vat,
    released: Boolean(row.released_at),
  }
}

function mapInvoice(row: InvoiceRow, lines: LineRow[]): InvoiceRecord {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    clientId: row.client_id,
    billToName: row.bill_to_name,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    totalPence: row.total_pence,
    paymentDetails: row.payment_details || '',
    lines: lines
      .filter((line) => line.invoice_id === row.id)
      .sort((a, b) => a.position - b.position)
      .map(mapLine),
  }
}

async function requireUser() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  return { supabase, user }
}

export async function listInvoices(): Promise<InvoiceRecord[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('invoices')
    .select('id, client_id, number, status, issued_on, due_on, bill_to_name, payment_details, total_pence')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  const invoices = (data || []) as InvoiceRow[]
  if (!invoices.length) return []
  const { data: lineData, error: lineError } = await supabase
    .from('invoice_lines')
    .select('id, invoice_id, appointment_id, position, description, session_date, unit_pence, includes_vat, released_at')
    .eq('owner_id', user.id)
    .in('invoice_id', invoices.map((invoice) => invoice.id))
  if (lineError) throw lineError
  const lines = (lineData || []) as LineRow[]
  return invoices.map((invoice) => mapInvoice(invoice, lines))
}

export async function loadPaymentDetails(): Promise<PaymentDetails> {
  const supabase = getSupabase()
  if (!supabase) return { ...EMPTY_PAYMENT }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ...EMPTY_PAYMENT }
  const { data, error } = await supabase
    .from('profiles')
    .select('invoice_account_name, invoice_sort_code, invoice_account_number, invoice_payment_note, invoice_due_days')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...EMPTY_PAYMENT }
  return {
    accountName: data.invoice_account_name || '',
    sortCode: data.invoice_sort_code || '',
    accountNumber: data.invoice_account_number || '',
    note: data.invoice_payment_note || '',
    dueDays: Number(data.invoice_due_days ?? 14),
  }
}

export async function savePaymentDetails(details: PaymentDetails): Promise<void> {
  const { supabase, user } = await requireUser()
  const dueDays = Math.max(0, Math.min(365, Math.round(Number(details.dueDays) || 0)))
  const { error } = await supabase
    .from('profiles')
    .update({
      invoice_account_name: details.accountName.trim() || null,
      invoice_sort_code: details.sortCode.trim() || null,
      invoice_account_number: details.accountNumber.trim() || null,
      invoice_payment_note: details.note.trim() || null,
      invoice_due_days: dueDays,
    })
    .eq('id', user.id)
  if (error) throw error
}

async function nextSequence(supabase: NonNullable<ReturnType<typeof getSupabase>>, userId: string): Promise<number> {
  const [{ data: profile }, { data: numbers }] = await Promise.all([
    supabase.from('profiles').select('invoice_next_number').eq('id', userId).maybeSingle(),
    supabase.from('invoices').select('number').eq('owner_id', userId),
  ])
  const stored = Number(profile?.invoice_next_number) || 1
  const used = (numbers || []).reduce((max, row) => Math.max(max, sequenceFromInvoiceNumber(row.number)), 0)
  return Math.max(stored, used + 1)
}

async function reloadInvoice(supabase: NonNullable<ReturnType<typeof getSupabase>>, userId: string, invoiceId: string): Promise<InvoiceRecord> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, client_id, number, status, issued_on, due_on, bill_to_name, payment_details, total_pence')
    .eq('id', invoiceId)
    .eq('owner_id', userId)
    .single()
  if (error) throw error
  const { data: lineData, error: lineError } = await supabase
    .from('invoice_lines')
    .select('id, invoice_id, appointment_id, position, description, session_date, unit_pence, includes_vat, released_at')
    .eq('invoice_id', invoiceId)
  if (lineError) throw lineError
  return mapInvoice(data as InvoiceRow, (lineData || []) as LineRow[])
}

export async function createInvoice(input: {
  clientId: string
  billToName: string
  lines: InvoiceLineInput[]
}): Promise<InvoiceRecord> {
  const lines = input.lines.filter((line) => line.description.trim() && line.unitPence > 0)
  if (!lines.length) throw new Error('Add at least one line with an amount.')
  const { supabase, user } = await requireUser()
  let sequence = await nextSequence(supabase, user.id)
  let createdId = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const number = formatInvoiceNumber(sequence)
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        owner_id: user.id,
        client_id: input.clientId,
        number,
        status: 'draft',
        bill_to_name: input.billToName.trim() || 'Client',
        payment_details: '',
        total_pence: invoiceTotalPence(lines),
      })
      .select('id')
      .single()
    if (error?.code === '23505') {
      sequence += 1
      continue
    }
    if (error) throw error
    createdId = data.id
    break
  }
  if (!createdId) throw new Error('Could not allocate an invoice number.')
  const { error: lineError } = await supabase.from('invoice_lines').insert(lines.map((line, index) => ({
    invoice_id: createdId,
    owner_id: user.id,
    appointment_id: line.appointmentId,
    position: index,
    description: line.description.trim(),
    session_date: line.sessionDate,
    unit_pence: line.unitPence,
    includes_vat: line.includesVat,
  })))
  if (lineError) {
    await supabase.from('invoices').delete().eq('id', createdId)
    throw lineError
  }
  await supabase.from('profiles').update({ invoice_next_number: sequence + 1 }).eq('id', user.id)
  return reloadInvoice(supabase, user.id, createdId)
}

export async function addInvoiceLine(invoiceId: string, line: InvoiceLineInput): Promise<InvoiceRecord> {
  if (!line.description.trim() || line.unitPence <= 0) throw new Error('Enter a description and an amount.')
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status !== 'draft') throw new Error('Issued invoices stay as they were sent.')
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: invoiceId,
    owner_id: user.id,
    appointment_id: line.appointmentId,
    position: current.lines.length,
    description: line.description.trim(),
    session_date: line.sessionDate,
    unit_pence: line.unitPence,
    includes_vat: line.includesVat,
  })
  if (error) throw error
  const next = await reloadInvoice(supabase, user.id, invoiceId)
  await supabase.from('invoices').update({ total_pence: invoiceTotalPence(next.lines) }).eq('id', invoiceId)
  return reloadInvoice(supabase, user.id, invoiceId)
}

export async function removeInvoiceLine(invoiceId: string, lineId: string): Promise<InvoiceRecord | null> {
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status !== 'draft') throw new Error('Issued invoices stay as they were sent.')
  const { error } = await supabase.from('invoice_lines').delete().eq('id', lineId).eq('invoice_id', invoiceId)
  if (error) throw error
  const remaining = current.lines.filter((line) => line.id !== lineId)
  if (!remaining.length) {
    const { error: deleteError } = await supabase.from('invoices').delete().eq('id', invoiceId)
    if (deleteError) throw deleteError
    return null
  }
  await supabase.from('invoices').update({ total_pence: invoiceTotalPence(remaining) }).eq('id', invoiceId)
  return reloadInvoice(supabase, user.id, invoiceId)
}

export async function setInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<InvoiceRecord> {
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (status === 'issued' && current.status === 'draft') {
    const details = await loadPaymentDetails()
    const issuedOn = todayYmd()
    const { error } = await supabase.from('invoices').update({
      status: 'issued',
      issued_on: issuedOn,
      due_on: dueDateFrom(issuedOn, details.dueDays),
      payment_details: paymentInstructions(details),
    }).eq('id', invoiceId)
    if (error) throw error
  } else if (status === 'paid' && current.status === 'issued') {
    const { error } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId)
    if (error) throw error
  } else if (status === 'issued' && current.status === 'paid') {
    const { error } = await supabase.from('invoices').update({ status: 'issued' }).eq('id', invoiceId)
    if (error) throw error
  } else if (status === 'void' && (current.status === 'draft' || current.status === 'issued')) {
    const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', invoiceId)
    if (error) throw error
    const { error: releaseError } = await supabase
      .from('invoice_lines')
      .update({ released_at: new Date().toISOString() })
      .eq('invoice_id', invoiceId)
    if (releaseError) throw releaseError
  } else {
    throw new Error('That invoice cannot move to this status.')
  }
  return reloadInvoice(supabase, user.id, invoiceId)
}
