import { describe, expect, it } from 'vitest'
import { DEFAULT_CANCELLATION_POLICY } from './cancellationPolicy'
import {
  activeBilledAppointmentIds,
  activityLineForInvoice,
  batchInvoiceGroups,
  dueDateFrom,
  formatInvoiceNumber,
  invoiceDisplayStatus,
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
    expect(invoiceTotalPence([{ unitPence: 8000, quantity: 2 }])).toBe(16000)
  })

  it('names draft, awaiting payment, partial, overdue, and paid', () => {
    expect(invoiceDisplayStatus({ status: 'draft', totalPence: 0 }, '2026-10-20')).toBe('draft')
    expect(invoiceDisplayStatus({ status: 'issued', totalPence: 8000, dueOn: '2026-10-25', payments: [] }, '2026-10-20')).toBe('awaiting')
    expect(invoiceDisplayStatus({ status: 'issued', totalPence: 8000, dueOn: '2026-10-25', payments: [{ amountPence: 1000 }] }, '2026-10-20')).toBe('partial')
    expect(invoiceDisplayStatus({ status: 'issued', totalPence: 8000, dueOn: '2026-10-19', payments: [{ amountPence: 1000 }] }, '2026-10-20')).toBe('overdue')
    expect(invoiceDisplayStatus({ status: 'issued', totalPence: 8000, dueOn: '2026-10-19', payments: [{ amountPence: 8000 }] }, '2026-10-20')).toBe('paid')
    expect(invoiceDisplayStatus({ status: 'paid', totalPence: 8000, payments: [{ amountPence: 8000 }] }, '2026-10-20')).toBe('paid')
    expect(invoiceDisplayStatus({ status: 'void', totalPence: 8000 }, '2026-10-20')).toBe('void')
  })

  it('puts clients who share a payer on one invoice', () => {
    const rows = [
      batchRow('a', 'Ada'),
      batchRow('b', 'Ben'),
    ]
    expect(batchInvoiceGroups(rows, 'client')).toHaveLength(2)
    const shared = batchInvoiceGroups(rows, 'payer')
    expect(shared).toHaveLength(1)
    expect(shared[0].clientId).toBeNull()
    expect(shared[0].forName).toBe('Ada, Ben')
    expect(shared[0].billToEmail).toBe('finance@council.test')
  })

  it('invoices a priced support activity and a concession', () => {
    const support = lineForInvoice({
      ...session({ attendance: null, fee: 4000 }),
      blockRole: 'support',
      serviceName: 'School meeting',
      startTime: '10:00',
      endTime: '11:00',
      priceNote: 'Student 20%',
    }, DEFAULT_CANCELLATION_POLICY, 'held')
    expect(support?.unitPence).toBe(4000)
    expect(support?.description).toContain('Support: School meeting')
    expect(support?.description).toContain('Student 20%')
    const booked = lineForInvoice({
      ...session({ attendance: null, fee: 6400 }),
      priceNote: 'Student 20%',
    }, DEFAULT_CANCELLATION_POLICY, 'booked')
    expect(booked?.description).toContain('Student 20%')
    expect(booked?.unitPence).toBe(6400)
  })

  it('builds a support line the clinician can price', () => {
    const line = activityLineForInvoice({
      ...session({ attendance: null, fee: null }),
      blockRole: 'support',
      serviceName: 'School meeting',
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(line?.description).toContain('Support: School meeting')
    expect(line?.unitPence).toBe(0)
    expect(line?.quantity).toBe(1)
  })
})

function batchRow(clientId, clientName) {
  return {
    clientId,
    clientName,
    billToName: 'Council',
    billToEmail: 'finance@council.test',
    line: {
      appointmentId: clientId,
      description: clientName,
      sessionDate: '2026-10-06',
      unitPence: 8000,
      quantity: 1,
      includesVat: false,
    },
  }
}

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
