import { attendanceLabel } from './appointmentUtils'
import { addDaysYmd, formatDisplayDate } from './dateArchitecture'
import {
  billablePence,
  roleOf,
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
  includesVat: boolean
}

export type InvoiceLine = InvoiceLineInput & {
  id: string
  released: boolean
}

export type InvoiceRecord = {
  id: string
  number: string
  status: InvoiceStatus
  clientId: string | null
  billToName: string
  issuedOn: string | null
  dueOn: string | null
  totalPence: number
  paymentDetails: string
  lines: InvoiceLine[]
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
  if (roleOf(appointment) !== 'appointment') return null
  if (!appointment.clientId) return null
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
    includesVat: Boolean(appointment.feeIncludesVat),
  }
}

export function invoiceTotalPence(lines: Array<{ unitPence: number }>): number {
  return lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.unitPence)) || 0), 0)
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

export function invoiceStatusLabel(status: string): string {
  if (status === 'draft') return 'Draft'
  if (status === 'issued') return 'Issued'
  if (status === 'paid') return 'Paid'
  if (status === 'void') return 'Void'
  return status
}
