import { attendanceLabel } from './appointmentUtils'
import { addDaysYmd, formatDisplayDate } from './dateArchitecture'
import {
  billablePence,
  formatHoursFromMinutes,
  roleOf,
  slotMinutes,
  type ReportAppointment,
} from './reporting'
import type { CancellationPolicy } from './cancellationPolicy'

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'

export type PaymentDetails = {
  accountName: string
  sortCode: string
  accountNumber: string
  note: string
  dueDays: number
}

export const EMPTY_PAYMENT: PaymentDetails = {
  accountName: '',
  sortCode: '',
  accountNumber: '',
  note: '',
  dueDays: 14,
}

export type InvoiceLineInput = {
  appointmentId: string | null
  description: string
  sessionDate: string | null
  unitPence: number
  quantity?: number
  includesVat: boolean
}

export type InvoiceLine = InvoiceLineInput & {
  id: string
  quantity: number
  released: boolean
}

export type InvoicePayment = {
  id: string
  amountPence: number
  paidOn: string
  note: string
}

export type InvoiceRecord = {
  id: string
  number: string
  status: InvoiceStatus
  clientId: string | null
  billToName: string
  forName: string
  issuedOn: string | null
  dueOn: string | null
  totalPence: number
  paymentDetails: string
  billToEmail: string
  lines: InvoiceLine[]
  payments: InvoicePayment[]
}

export type InvoiceDisplay = 'draft' | 'awaiting' | 'partial' | 'paid' | 'overdue' | 'void'

export type BatchLine = {
  clientId: string
  clientName: string
  billToName: string
  billToEmail: string
  line: InvoiceLineInput
}

export type InvoiceBatch = {
  key: string
  clientId: string | null
  billToName: string
  billToEmail: string
  forName: string
  lines: InvoiceLineInput[]
}

export function formatInvoiceNumber(sequence: number): string {
  const value = Math.max(1, Math.trunc(Number(sequence)) || 1)
  return `INV-${String(value).padStart(4, '0')}`
}

export function sequenceFromInvoiceNumber(number: string): number {
  const match = String(number || '').match(/(\d+)\s*$/)
  return match ? Number(match[1]) : 0
}

export function dueDateFrom(issuedOn: string, dueDays: number): string {
  const days = Math.max(0, Math.min(365, Math.trunc(Number(dueDays)) || 0))
  return addDaysYmd(issuedOn, days)
}

export function paymentInstructions(details: PaymentDetails): string {
  const lines = []
  if (details.accountName.trim()) lines.push(details.accountName.trim())
  if (details.sortCode.trim()) lines.push(`Sort code ${details.sortCode.trim()}`)
  if (details.accountNumber.trim()) lines.push(`Account number ${details.accountNumber.trim()}`)
  if (details.note.trim()) lines.push(details.note.trim())
  return lines.join('\n')
}

export function lineFromAppointment(
  appointment: ReportAppointment,
  policy: CancellationPolicy,
): InvoiceLineInput | null {
  return lineForInvoice(appointment, policy, 'held')
}

export function lineForInvoice(
  appointment: ReportAppointment,
  policy: CancellationPolicy,
  include: 'held' | 'booked' | 'both',
): InvoiceLineInput | null {
  if (roleOf(appointment) !== 'appointment') return null
  if (!appointment.clientId || appointment.doNotInvoice) return null
  const marked = Boolean(appointment.attendance)
  if (include === 'held' && !marked) return null
  if (include === 'booked' && marked) return null
  if (marked) {
    const pence = billablePence(appointment, policy)
    if (pence <= 0) return null
    const service = appointment.serviceName || 'Session'
    const when = appointment.sessionDate ? formatDisplayDate(appointment.sessionDate) : ''
    const attendance = appointment.attendance && appointment.attendance !== 'attended'
      ? ` (${attendanceLabel(appointment.attendance)})`
      : ''
    const description = when ? `${when} — ${service}${attendance}` : `${service}${attendance}`
    return {
      appointmentId: appointment.id,
      description,
      sessionDate: appointment.sessionDate || null,
      unitPence: pence,
      quantity: 1,
      includesVat: Boolean(appointment.feeIncludesVat),
    }
  }
  if (!appointment.feePence || appointment.feePence <= 0) return null
  const service = appointment.serviceName || 'Session'
  const when = appointment.sessionDate ? formatDisplayDate(appointment.sessionDate) : ''
  return {
    appointmentId: appointment.id,
    description: when ? `${when} — ${service}` : service,
    sessionDate: appointment.sessionDate || null,
    unitPence: appointment.feePence,
    quantity: 1,
    includesVat: Boolean(appointment.feeIncludesVat),
  }
}

export function activityLineForInvoice(appointment: ReportAppointment): InvoiceLineInput | null {
  const role = roleOf(appointment)
  if (role !== 'support' && role !== 'admin') return null
  if (appointment.externalBusy || appointment.doNotInvoice) return null
  const kind = role === 'support' ? 'Support' : 'Admin'
  const title = appointment.serviceName || appointment.clientName || kind
  const when = appointment.sessionDate ? formatDisplayDate(appointment.sessionDate) : ''
  const hours = formatHoursFromMinutes(slotMinutes(appointment.startTime, appointment.endTime))
  const detail = `${kind}: ${title} (${hours})`
  return {
    appointmentId: appointment.id,
    description: when ? `${when} — ${detail}` : detail,
    sessionDate: appointment.sessionDate || null,
    unitPence: 0,
    quantity: 1,
    includesVat: false,
  }
}

export function invoiceRecipient({
  clientName,
  clientEmail = '',
  contacts = [],
}: {
  clientName: string
  clientEmail?: string
  contacts?: Array<{ name?: string; email?: string; sendInvoices?: boolean }>
}) {
  const billing = contacts.filter((contact) => contact.sendInvoices && String(contact.email || '').trim())
  if (billing.length) {
    return {
      billToName: billing.map((contact) => String(contact.name || '').trim() || String(contact.email).trim()).join(', '),
      billToEmail: billing.map((contact) => String(contact.email).trim()).join(', '),
    }
  }
  return {
    billToName: clientName || 'Client',
    billToEmail: String(clientEmail || '').trim(),
  }
}

export function lineQuantity(value: unknown): number {
  const qty = Math.trunc(Number(value))
  return Number.isFinite(qty) && qty >= 1 ? qty : 1
}

export function lineAmountPence(line: { unitPence: number; quantity?: number }): number {
  return Math.max(0, Math.trunc(Number(line.unitPence)) || 0) * lineQuantity(line.quantity)
}

export function invoiceTotalPence(lines: Array<{ unitPence: number; quantity?: number }>): number {
  return lines.reduce((sum, line) => sum + lineAmountPence(line), 0)
}

export function paidPence(payments: Array<{ amountPence: number }> = []): number {
  return payments.reduce((sum, payment) => sum + Math.max(0, Math.trunc(Number(payment.amountPence)) || 0), 0)
}

export function invoiceBalancePence(invoice: { totalPence: number; payments?: Array<{ amountPence: number }> }): number {
  return Math.max(0, Math.max(0, Math.trunc(Number(invoice.totalPence)) || 0) - paidPence(invoice.payments))
}

export function invoiceDisplayStatus(
  invoice: {
    status: string
    totalPence?: number
    dueOn?: string | null
    payments?: Array<{ amountPence: number }>
  },
  today: string,
): InvoiceDisplay {
  if (invoice.status === 'void') return 'void'
  if (invoice.status === 'draft') return 'draft'
  const total = Math.max(0, Math.trunc(Number(invoice.totalPence)) || 0)
  const paid = paidPence(invoice.payments)
  if (invoice.status === 'paid' || (total > 0 && paid >= total)) return 'paid'
  if (invoice.dueOn && today && invoice.dueOn < today) return 'overdue'
  if (paid > 0) return 'partial'
  return 'awaiting'
}

const DISPLAY_LABELS: Record<InvoiceDisplay, string> = {
  draft: 'Draft',
  awaiting: 'Awaiting payment',
  partial: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

export function invoiceStatusLabel(
  invoice: {
    status: string
    totalPence?: number
    dueOn?: string | null
    payments?: Array<{ amountPence: number }>
  },
  today: string,
): string {
  return DISPLAY_LABELS[invoiceDisplayStatus(invoice, today)]
}

export function batchInvoiceGroups(rows: BatchLine[], mode: 'client' | 'payer'): InvoiceBatch[] {
  const groups = new Map<string, InvoiceBatch & { names: string[] }>()
  for (const row of rows) {
    const payerKey = row.billToEmail.trim().toLowerCase() || row.billToName.trim().toLowerCase() || row.clientId
    const key = mode === 'payer' ? `payer:${payerKey}` : `client:${row.clientId}`
    const current = groups.get(key) || {
      key,
      clientId: row.clientId,
      billToName: row.billToName,
      billToEmail: row.billToEmail,
      forName: '',
      lines: [],
      names: [],
    }
    if (mode === 'payer' && current.clientId && current.clientId !== row.clientId) current.clientId = null
    if (!current.names.includes(row.clientName)) current.names.push(row.clientName)
    current.lines.push(row.line)
    groups.set(key, current)
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    clientId: group.clientId,
    billToName: group.billToName,
    billToEmail: group.billToEmail,
    forName: group.names.join(', '),
    lines: group.lines,
  }))
}

export function activeBilledAppointmentIds(
  invoices: Array<{ status: string; lines: Array<{ appointmentId: string | null; released?: boolean }> }>,
): Set<string> {
  const ids = new Set<string>()
  for (const invoice of invoices) {
    if (invoice.status === 'void') continue
    for (const line of invoice.lines) {
      if (line.appointmentId && !line.released) ids.add(line.appointmentId)
    }
  }
  return ids
}

