import { getSupabase } from './client'
import {
  dueDateFrom,
  formatInvoiceNumber,
  invoiceBalancePence,
  invoiceTotalPence,
  lineQuantity,
  paidPence,
  paymentInstructions,
  sequenceFromInvoiceNumber,
  EMPTY_PAYMENT,
} from '../invoices'
import type { InvoiceLine, InvoiceLineInput, InvoicePayment, InvoiceRecord, InvoiceStatus, PaymentDetails } from '../invoices'
import { todayYmd } from '../dateArchitecture'

type InvoiceRow = {
  id: string
  client_id: string | null
  number: string
  status: InvoiceStatus
  issued_on: string | null
  due_on: string | null
  bill_to_name: string
  for_name: string
  payment_details: string
  bill_to_email: string
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
  quantity: number
  includes_vat: boolean
  released_at: string | null
}

type PaymentRow = {
  id: string
  invoice_id: string
  amount_pence: number
  paid_on: string
  note: string
}

const INVOICE_COLUMNS = 'id, client_id, number, status, issued_on, due_on, bill_to_name, for_name, bill_to_email, payment_details, total_pence'
const LINE_COLUMNS = 'id, invoice_id, appointment_id, position, description, session_date, unit_pence, quantity, includes_vat, released_at'
const PAYMENT_COLUMNS = 'id, invoice_id, amount_pence, paid_on, note'

function mapLine(row: LineRow): InvoiceLine {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    description: row.description,
    sessionDate: row.session_date,
    unitPence: row.unit_pence,
    quantity: lineQuantity(row.quantity),
    includesVat: row.includes_vat,
    released: Boolean(row.released_at),
  }
}

function mapPayment(row: PaymentRow): InvoicePayment {
  return {
    id: row.id,
    amountPence: row.amount_pence,
    paidOn: row.paid_on,
    note: row.note || '',
  }
}

function mapInvoice(row: InvoiceRow, lines: LineRow[], payments: PaymentRow[]): InvoiceRecord {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    clientId: row.client_id,
    billToName: row.bill_to_name,
    forName: row.for_name || '',
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    totalPence: row.total_pence,
    paymentDetails: row.payment_details || '',
    billToEmail: row.bill_to_email || '',
    lines: lines
      .filter((line) => line.invoice_id === row.id)
      .sort((a, b) => a.position - b.position)
      .map(mapLine),
    payments: payments
      .filter((payment) => payment.invoice_id === row.id)
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
      .map(mapPayment),
  }
}

function lineInsert(userId: string, invoiceId: string, line: InvoiceLineInput, position: number) {
  return {
    invoice_id: invoiceId,
    owner_id: userId,
    appointment_id: line.appointmentId,
    position,
    description: line.description.trim(),
    session_date: line.sessionDate,
    unit_pence: Math.max(0, Math.trunc(Number(line.unitPence)) || 0),
    quantity: lineQuantity(line.quantity),
    includes_vat: Boolean(line.includesVat),
  }
}

function usableLines(lines: InvoiceLineInput[]): InvoiceLineInput[] {
  return lines.filter((line) => line.description.trim() && Math.trunc(Number(line.unitPence)) >= 0)
}

function asInvoiceError(error: { code?: string; message?: string } | null) {
  if (!error) return null
  if (error.code === '23505' && String(error.message || '').includes('appointment')) {
    return new Error('That session is already on an invoice.')
  }
  return error
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
    .select(INVOICE_COLUMNS)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  const invoices = (data || []) as InvoiceRow[]
  if (!invoices.length) return []
  const ids = invoices.map((invoice) => invoice.id)
  const [{ data: lineData, error: lineError }, { data: paymentData, error: paymentError }] = await Promise.all([
    supabase.from('invoice_lines').select(LINE_COLUMNS).eq('owner_id', user.id).in('invoice_id', ids),
    supabase.from('invoice_payments').select(PAYMENT_COLUMNS).eq('owner_id', user.id).in('invoice_id', ids),
  ])
  if (lineError) throw lineError
  if (paymentError) throw paymentError
  const lines = (lineData || []) as LineRow[]
  const payments = (paymentData || []) as PaymentRow[]
  return invoices.map((invoice) => mapInvoice(invoice, lines, payments))
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
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .eq('owner_id', userId)
    .single()
  if (error) throw error
  const [{ data: lineData, error: lineError }, { data: paymentData, error: paymentError }] = await Promise.all([
    supabase.from('invoice_lines').select(LINE_COLUMNS).eq('invoice_id', invoiceId),
    supabase.from('invoice_payments').select(PAYMENT_COLUMNS).eq('invoice_id', invoiceId),
  ])
  if (lineError) throw lineError
  if (paymentError) throw paymentError
  return mapInvoice(data as InvoiceRow, (lineData || []) as LineRow[], (paymentData || []) as PaymentRow[])
}

async function storeTotal(supabase: NonNullable<ReturnType<typeof getSupabase>>, userId: string, invoiceId: string) {
  const next = await reloadInvoice(supabase, userId, invoiceId)
  const { error } = await supabase.from('invoices').update({ total_pence: invoiceTotalPence(next.lines) }).eq('id', invoiceId)
  if (error) throw error
  return reloadInvoice(supabase, userId, invoiceId)
}

export async function createInvoice(input: {
  clientId: string | null
  billToName: string
  billToEmail?: string
  forName?: string
  lines: InvoiceLineInput[]
}): Promise<InvoiceRecord> {
  const lines = usableLines(input.lines)
  if (input.lines.length > 0 && !lines.length) throw new Error('Enter a description.')
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
        bill_to_name: input.billToName.trim() || 'Invoice',
        bill_to_email: String(input.billToEmail || '').trim(),
        for_name: String(input.forName || '').trim(),
        payment_details: '',
        total_pence: invoiceTotalPence(lines),
      })
      .select('id')
      .single()
    if (error?.code === '23505' && !String(error.message || '').includes('appointment')) {
      sequence += 1
      continue
    }
    if (error) throw error
    createdId = data.id
    break
  }
  if (!createdId) throw new Error('Could not allocate an invoice number.')
  if (lines.length) {
    const { error: lineError } = await supabase.from('invoice_lines').insert(
      lines.map((line, index) => lineInsert(user.id, createdId, line, index)),
    )
    if (lineError) {
      await supabase.from('invoices').delete().eq('id', createdId)
      throw asInvoiceError(lineError)
    }
  }
  await supabase.from('profiles').update({ invoice_next_number: sequence + 1 }).eq('id', user.id)
  return reloadInvoice(supabase, user.id, createdId)
}

export async function updateInvoiceRecipient(
  invoiceId: string,
  input: { billToName: string; billToEmail: string },
): Promise<InvoiceRecord> {
  const name = input.billToName.trim()
  if (!name) throw new Error('Enter who receives this invoice.')
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status !== 'draft') throw new Error('Sent invoices keep the recipient they were sent to.')
  const { error } = await supabase.from('invoices').update({
    bill_to_name: name,
    bill_to_email: input.billToEmail.trim(),
  }).eq('id', invoiceId)
  if (error) throw error
  return reloadInvoice(supabase, user.id, invoiceId)
}

export async function addInvoiceLine(invoiceId: string, line: InvoiceLineInput): Promise<InvoiceRecord> {
  if (!line.description.trim()) throw new Error('Enter a description.')
  if (Math.trunc(Number(line.unitPence)) < 0) throw new Error('Enter an amount.')
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status !== 'draft') throw new Error('Sent invoices stay as they were sent.')
  const { error } = await supabase.from('invoice_lines').insert(lineInsert(user.id, invoiceId, line, current.lines.length))
  if (error) throw asInvoiceError(error)
  return storeTotal(supabase, user.id, invoiceId)
}

export async function updateInvoiceLine(invoiceId: string, lineId: string, line: InvoiceLineInput): Promise<InvoiceRecord> {
  if (!line.description.trim()) throw new Error('Enter a description.')
  if (Math.trunc(Number(line.unitPence)) < 0) throw new Error('Enter an amount.')
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status !== 'draft') throw new Error('Sent invoices stay as they were sent.')
  const { error } = await supabase.from('invoice_lines').update({
    description: line.description.trim(),
    session_date: line.sessionDate,
    unit_pence: Math.max(0, Math.trunc(Number(line.unitPence)) || 0),
    quantity: lineQuantity(line.quantity),
    includes_vat: Boolean(line.includesVat),
  }).eq('id', lineId).eq('invoice_id', invoiceId)
  if (error) throw error
  return storeTotal(supabase, user.id, invoiceId)
}

export async function removeInvoiceLine(invoiceId: string, lineId: string): Promise<InvoiceRecord> {
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status !== 'draft') throw new Error('Sent invoices stay as they were sent.')
  const { error } = await supabase.from('invoice_lines').delete().eq('id', lineId).eq('invoice_id', invoiceId)
  if (error) throw error
  return storeTotal(supabase, user.id, invoiceId)
}

export async function setInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<InvoiceRecord> {
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (status === 'issued' && current.status === 'draft') {
    if (current.totalPence <= 0) throw new Error('Add a line with an amount before you mark this as sent.')
    const details = await loadPaymentDetails()
    const issuedOn = todayYmd()
    const { error } = await supabase.from('invoices').update({
      status: 'issued',
      issued_on: issuedOn,
      due_on: dueDateFrom(issuedOn, details.dueDays),
      payment_details: paymentInstructions(details),
    }).eq('id', invoiceId)
    if (error) throw error
  } else if (status === 'void' && current.status !== 'void') {
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

export async function recordInvoicePayment(
  invoiceId: string,
  input: { amountPence: number; paidOn: string },
): Promise<InvoiceRecord> {
  const amount = Math.trunc(Number(input.amountPence))
  if (!amount || amount <= 0) throw new Error('Enter the amount paid.')
  if (!input.paidOn) throw new Error('Enter the date paid.')
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status === 'draft') throw new Error('Mark the invoice as sent before you record a payment.')
  if (current.status === 'void') throw new Error('A void invoice cannot take a payment.')
  if (current.status === 'paid' || invoiceBalancePence(current) <= 0) throw new Error('This invoice is already paid.')
  const { error } = await supabase.from('invoice_payments').insert({
    invoice_id: invoiceId,
    owner_id: user.id,
    amount_pence: amount,
    paid_on: input.paidOn,
    note: '',
  })
  if (error) throw error
  const next = await reloadInvoice(supabase, user.id, invoiceId)
  if (next.totalPence > 0 && paidPence(next.payments) >= next.totalPence) {
    const { error: paidError } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId)
    if (paidError) throw paidError
  }
  return reloadInvoice(supabase, user.id, invoiceId)
}

export async function removeInvoicePayment(invoiceId: string, paymentId: string): Promise<InvoiceRecord> {
  const { supabase, user } = await requireUser()
  const current = await reloadInvoice(supabase, user.id, invoiceId)
  if (current.status === 'draft' || current.status === 'void') throw new Error('That payment cannot be removed.')
  const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId).eq('invoice_id', invoiceId)
  if (error) throw error
  const next = await reloadInvoice(supabase, user.id, invoiceId)
  if (next.status === 'paid' && paidPence(next.payments) < next.totalPence) {
    const { error: reopenError } = await supabase.from('invoices').update({ status: 'issued' }).eq('id', invoiceId)
    if (reopenError) throw reopenError
  }
  return reloadInvoice(supabase, user.id, invoiceId)
}
