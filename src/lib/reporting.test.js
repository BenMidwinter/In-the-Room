import { describe, expect, it } from 'vitest'
import { defaultWeeklyHours } from './clinicianAvailability'
import {
  availabilityMinutes,
  averageWaitDays,
  efficiencyFromMinutes,
  monthToDateRange,
  noteStateFor,
  rollingWeekRange,
  practiceActivities,
  summariseAppointments,
  timeBuckets,
} from './reporting'

describe('reporting', () => {
  it('opens on a rolling week of seven days', () => {
    const range = rollingWeekRange('2026-10-07')
    expect(range).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(monthToDateRange('2026-10-07').from).toBe('2026-10-01')
  })

  it('counts weekday availability and leaves the weekend out', () => {
    const minutes = availabilityMinutes(
      [{ workplace_id: 'private', weekly_hours: defaultWeeklyHours(), service_ids: [] }],
      { from: '2026-10-05', to: '2026-10-11' },
    )
    expect(minutes).toBe(5 * 8 * 60)
  })

  it('expresses used time as a percentage of availability minus busy time', () => {
    const result = efficiencyFromMinutes({
      availability: 40 * 60,
      busy: 8 * 60,
      appointment: 16 * 60,
      support: 4 * 60,
      admin: 2 * 60,
    })
    expect(result.bookable).toBe(32 * 60)
    expect(result.used).toBe(22 * 60)
    expect(result.open).toBe(10 * 60)
    expect(result.rate).toBe(69)
  })

  it('tallies attended hours, fees, and notes still to finish', () => {
    const appointments = [
      session({ id: 'a', attendance: 'attended', minutes: 50, fee: 8000 }),
      session({ id: 'b', attendance: 'attended', minutes: 50, fee: 8000, charged: 8000 }),
      session({ id: 'c', attendance: 'did_not_attend', minutes: 50, fee: 8000, charged: 8000 }),
      session({ id: 'd', attendance: 'cancelled', minutes: 50, fee: 8000, charged: 0, doNotInvoice: true }),
      session({ id: 'e', attendance: null, blockRole: 'busy', minutes: 60 }),
      session({ id: 'f', attendance: null, blockRole: 'support', minutes: 10 }),
    ]
    const notes = new Map([
      ['a', 'complete'],
      ['b', 'draft'],
    ])
    const summary = summariseAppointments(appointments, { from: '2026-10-01', to: '2026-10-07' }, notes)
    expect(summary.attended).toBe(2)
    expect(summary.deliveredMinutes).toBe(100)
    expect(summary.notesToFinish).toBe(1)
    expect(summary.dna).toBe(1)
    expect(summary.earnedPence).toBe(8000 + 8000 + 8000)
    const buckets = timeBuckets(appointments, { from: '2026-10-01', to: '2026-10-07' })
    expect(buckets.busy).toBe(60)
    expect(buckets.support).toBe(10)
    expect(buckets.appointment).toBe(50 * 3)
  })

  it('reads a signed-off note as complete', () => {
    expect(noteStateFor([{ status: 'draft' }, { status: 'signed_off' }])).toBe('complete')
    expect(noteStateFor([])).toBe('missing')
  })

  it('lists clinical, CPD, and supervision hours together', () => {
    const other = session({ id: 'c', attendance: 'attended', minutes: 60 })
    other.serviceId = 'other'
    other.serviceName = 'Other'
    other.clientName = 'Bea'
    const rows = practiceActivities(
      [
        session({ id: 'a', attendance: 'attended', minutes: 50 }),
        session({ id: 'b', attendance: 'did_not_attend', minutes: 50 }),
        other,
      ],
      {
        cpd: [{ id: 'p1', occurred_on: '2026-10-02', minutes: 90, label: 'Conference' }],
        supervision: [
          { id: 's1', occurred_on: '2026-10-04', minutes: 60, label: 'Peer group', direction: 'received' },
          { id: 's2', occurred_on: '2026-09-01', minutes: 60, label: 'Old', direction: 'delivered' },
        ],
      },
      { from: '2026-10-01', to: '2026-10-07' },
      'svc',
    )
    expect(rows.map((row) => row.kind)).toEqual(['Clinical', 'Supervision received', 'CPD'])
    expect(rows[0]).toMatchObject({ activity: 'Ada', service: 'Session', minutes: 50 })
    expect(rows.find((row) => row.kind === 'CPD')).toMatchObject({ activity: 'Conference', minutes: 90, service: '—' })
    const unfiltered = practiceActivities(
      [session({ id: 'a', attendance: 'attended', minutes: 50 }), other],
      { cpd: [], supervision: [] },
      { from: '2026-10-01', to: '2026-10-07' },
    )
    expect(unfiltered).toHaveLength(2)
  })

  it('averages days on the waitlist', () => {
    expect(averageWaitDays(['2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z'], '2026-10-07')).toBe(4)
    expect(averageWaitDays([], '2026-10-07')).toBeNull()
  })
})

function session({
  id,
  attendance,
  minutes,
  fee = null,
  charged = null,
  doNotInvoice = false,
  blockRole = 'client_session',
}) {
  const endHour = 9
  const endMinute = minutes
  const end = `${String(endHour + Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`
  return {
    id,
    clientId: 'client-1',
    clientName: 'Ada',
    serviceId: 'svc',
    serviceName: 'Session',
    sessionDate: '2026-10-06',
    startTime: '09:00',
    endTime: end,
    attendance,
    blockRole,
    externalBusy: false,
    doNotInvoice,
    chargedPence: charged,
    feePence: fee,
    feeIncludesVat: false,
  }
}
