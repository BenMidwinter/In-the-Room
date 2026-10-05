import { describe, expect, it } from 'vitest'
import { chargeForAttendance, portionOfFee, sessionStartFromParts } from './cancellationPolicy'

const policy = {
  noticeHours: 48,
  lateFee: 'full',
  earlyFee: 'none',
  dnaFee: 'half',
}

describe('cancellation charges', () => {
  const sessionDate = '2026-10-10'
  const startTime = '10:00'
  const start = sessionStartFromParts(sessionDate, startTime)

  it('charges the full fee for an attended session', () => {
    const charge = chargeForAttendance({
      attendance: 'attended',
      sessionDate,
      startTime,
      feePence: 8000,
      policy,
    })
    expect(charge.chargedPence).toBe(8000)
    expect(charge.doNotInvoice).toBe(false)
  })

  it('uses the early fee when the cancellation is outside the notice', () => {
    const markedAt = new Date(start.getTime() - 72 * 3600000)
    const charge = chargeForAttendance({
      attendance: 'cancelled',
      sessionDate,
      startTime,
      markedAt,
      feePence: 8000,
      policy,
    })
    expect(charge.chargedPence).toBe(0)
    expect(charge.summary).toMatch(/No fee/)
  })

  it('uses the late fee when the cancellation is inside the notice', () => {
    const markedAt = new Date(start.getTime() - 12 * 3600000)
    const charge = chargeForAttendance({
      attendance: 'cancelled',
      sessionDate,
      startTime,
      markedAt,
      feePence: 8000,
      policy,
    })
    expect(charge.chargedPence).toBe(8000)
  })

  it('uses the DNA fee, and Do not invoice overrides it', () => {
    expect(portionOfFee(8000, 'half')).toBe(4000)
    const charged = chargeForAttendance({
      attendance: 'did_not_attend',
      sessionDate,
      startTime,
      feePence: 8000,
      policy,
    })
    expect(charged.chargedPence).toBe(4000)
    const waived = chargeForAttendance({
      attendance: 'did_not_attend',
      sessionDate,
      startTime,
      feePence: 8000,
      policy,
      doNotInvoice: true,
    })
    expect(waived.chargedPence).toBe(0)
    expect(waived.summary).toBe('Do not invoice.')
  })
})
