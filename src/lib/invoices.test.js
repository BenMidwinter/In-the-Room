import { describe, expect, it } from 'vitest'
import { DEFAULT_CANCELLATION_POLICY } from './cancellationPolicy'
import {
  activeBilledAppointmentIds,
  dueDateFrom,
  formatInvoiceNumber,
  invoiceTotalPence,
  invoiceRecipient,
  lineForInvoice,
  lineFromAppointment,
  paymentInstructions,
  sequenceFromInvoiceNumber,
} from './invoices'

describe('invoices', () => {
  it('numbers invoices and reads the sequence back', () => {
    expect(formatInvoiceNumber(1)).toBe('INV-0001')
    expect(formatInvoiceNumber(42)).toBe('INV-0042')
    expect(sequenceFromInvoiceNumber('INV-0042')).toBe(42)
  })

  it('writes bank details as the payment block', () => {
    expect(paymentInstructions({
      accountName: 'A Clinician',
      sortCode: '00-11-22',
      accountNumber: '12345678',
      note: 'Use the invoice number',
      dueDays: 14,
    })).toBe('A Clinician\nSort code 00-11-22\nAccount number 12345678\nUse the invoice number')
  })

  it('sets the due date from the issue date', () => {
    expect(dueDateFrom('2026-10-05', 14)).toBe('2026-10-19')
  })

  it('builds a line from a marked session and skips a session with no fee', () => {
    const attended = lineFromAppointment(session({ attendance: 'attended', fee: 8000 }), DEFAULT_CANCELLATION_POLICY)
    expect(attended).toMatchObject({
      appointmentId: 'a',
      unitPence: 8000,
      includesVat: true,
      description: '6 Oct 2026 — Session',
    })
    expect(lineFromAppointment(session({ attendance: 'attended', fee: null }), DEFAULT_CANCELLATION_POLICY)).toBeNull()
    const dna = lineFromAppointment(session({ attendance: 'did_not_attend', fee: 8000, charged: 4000 }), DEFAULT_CANCELLATION_POLICY)
    expect(dna?.unitPence).toBe(4000)
    expect(dna?.description).toContain('Did not attend')
    const booked = lineForInvoice(session({ attendance: null, fee: 8000 }), DEFAULT_CANCELLATION_POLICY, 'booked')
    expect(booked?.unitPence).toBe(8000)
    expect(lineForInvoice(session({ attendance: null, fee: 8000 }), DEFAULT_CANCELLATION_POLICY, 'held')).toBeNull()
  })

  it('sends to a billing contact instead of the client', () => {
    expect(invoiceRecipient({
      clientName: 'Ada Young',
      clientEmail: 'ada@example.com',
      contacts: [{ name: 'Local Authority', email: 'finance@council.test', sendInvoices: true }],
    })).toEqual({ billToName: 'Local Authority', billToEmail: 'finance@council.test' })
    expect(invoiceRecipient({
      clientName: 'Ada Young',
      clientEmail: 'ada@example.com',
      contacts: [{ name: 'Parent', email: 'parent@example.com', sendInvoices: false }],
    })).toEqual({ billToName: 'Ada Young', billToEmail: 'ada@example.com' })
  })

  it('keeps a voided session free to invoice again', () => {
    const ids = activeBilledAppointmentIds([
      { status: 'draft', lines: [{ appointmentId: 'a', released: false }] },
      { status: 'void', lines: [{ appointmentId: 'b', released: true }] },
    ])
    expect([...ids]).toEqual(['a'])
    expect(invoiceTotalPence([{ unitPence: 8000 }, { unitPence: 1500 }])).toBe(9500)
  })
})

function session({ attendance, fee, charged = null }) {
  return {
    id: 'a',
    clientId: 'client-1',
    clientName: 'Ada',
    serviceId: 'svc',
    serviceName: 'Session',
    sessionDate: '2026-10-06',
    startTime: '09:00',
    endTime: '09:50',
    attendance,
    blockRole: 'client_session',
    externalBusy: false,
    doNotInvoice: false,
    chargedPence: charged,
    feePence: fee,
    feeIncludesVat: true,
  }
}
