export type FeePortion = 'full' | 'half' | 'none'

export type CancellationPolicy = {
  noticeHours: number
  lateFee: FeePortion
  earlyFee: FeePortion
  dnaFee: FeePortion
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  noticeHours: 48,
  lateFee: 'full',
  earlyFee: 'none',
  dnaFee: 'full',
}

export function portionOfFee(feePence: number | null | undefined, portion: FeePortion): number {
  const fee = Number(feePence)
  if (!Number.isFinite(fee) || fee <= 0 || portion === 'none') return 0
  if (portion === 'half') return Math.round(fee / 2)
  return Math.round(fee)
}

export function sessionStartFromParts(sessionDate: string, startTime: string): Date {
  const [year, month, day] = String(sessionDate || '').split('-').map(Number)
  const [hour, minute] = String(startTime || '00:00').split(':').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0)
}

export type AttendanceCharge = {
  chargedPence: number | null
  doNotInvoice: boolean
  summary: string
}

export function chargeForAttendance({
  attendance,
  sessionDate,
  startTime,
  markedAt = new Date(),
  feePence,
  policy = DEFAULT_CANCELLATION_POLICY,
  doNotInvoice = false,
}: {
  attendance: string | null
  sessionDate: string
  startTime: string
  markedAt?: Date
  feePence: number | null | undefined
  policy?: CancellationPolicy
  doNotInvoice?: boolean
}): AttendanceCharge {
  if (!attendance) {
    return { chargedPence: null, doNotInvoice: false, summary: 'Attendance is not logged.' }
  }

  if (doNotInvoice && (attendance === 'cancelled' || attendance === 'did_not_attend')) {
    return { chargedPence: 0, doNotInvoice: true, summary: 'Do not invoice.' }
  }

  if (attendance === 'attended') {
    const charged = portionOfFee(feePence, 'full')
    return {
      chargedPence: charged,
      doNotInvoice: false,
      summary: feePence == null ? 'No price on this service.' : 'Full fee.',
    }
  }

  if (attendance === 'did_not_attend') {
    return {
      chargedPence: portionOfFee(feePence, policy.dnaFee),
      doNotInvoice: false,
      summary: feeLabel(policy.dnaFee, 'Did not attend'),
    }
  }

  if (attendance === 'cancelled') {
    const start = sessionStartFromParts(sessionDate, startTime)
    const hoursUntil = (start.getTime() - markedAt.getTime()) / 3600000
    const insideNotice = hoursUntil < policy.noticeHours
    const portion = insideNotice ? policy.lateFee : policy.earlyFee
    const when = insideNotice
      ? `Cancelled inside ${policy.noticeHours} hours`
      : `Cancelled more than ${policy.noticeHours} hours ahead`
    return {
      chargedPence: portionOfFee(feePence, portion),
      doNotInvoice: false,
      summary: feeLabel(portion, when),
    }
  }

  return { chargedPence: null, doNotInvoice: false, summary: 'Attendance is not logged.' }
}

function feeLabel(portion: FeePortion, when: string): string {
  if (portion === 'none') return `${when}. No fee.`
  if (portion === 'half') return `${when}. Half fee.`
  return `${when}. Full fee.`
}
