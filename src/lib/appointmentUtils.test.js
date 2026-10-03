import { describe, it, expect } from 'vitest'
import {
  appointmentSchedule,
  appointmentInstant,
  fromDatetimeLocalValue,
  appointmentDurationMinutes,
  appointmentTypeLabel,
  attendanceLabel,
  attendanceBadgeClass,
  formatSessionDateTime,
  formatAgendaDayHeading,
  groupAppointmentsForAgenda,
} from './appointmentUtils'
import { DEMO_TODAY, addDaysYmd } from './dateArchitecture'

describe('appointmentSchedule', () => {
  it('prefers explicit session_date + start_time', () => {
    expect(appointmentSchedule({ session_date: '2026-06-26', start_time: '14:00' }))
      .toEqual({ session_date: '2026-06-26', start_time: '14:00' })
  })
  it('derives from scheduled_at (local wall-clock)', () => {
    expect(appointmentSchedule({ scheduled_at: '2026-06-26T14:30:00' }))
      .toEqual({ session_date: '2026-06-26', start_time: '14:30' })
  })
  it('returns empties for nothing', () => {
    expect(appointmentSchedule(null)).toEqual({ session_date: '', start_time: '' })
    expect(appointmentSchedule({})).toEqual({ session_date: '', start_time: '' })
  })
})

describe('appointmentInstant', () => {
  it('builds an ISO-like instant', () => {
    expect(appointmentInstant({ session_date: '2026-06-26', start_time: '09:00' }))
      .toBe('2026-06-26T09:00:00')
  })
  it('defaults missing time to midnight when the schedule resolves via scheduled_at', () => {
    // Midnight is a full valid instant, so appointmentSchedule keeps it.
    expect(appointmentInstant({ scheduled_at: '2026-06-26T00:00:00' })).toBe('2026-06-26T00:00:00')
  })
  it('is empty when only a bare session_date is given (needs date + time to resolve)', () => {
    expect(appointmentInstant({ session_date: '2026-06-26' })).toBe('')
  })
})

describe('fromDatetimeLocalValue', () => {
  it('splits a datetime-local value', () => {
    expect(fromDatetimeLocalValue('2026-06-26T14:30')).toEqual({
      session_date: '2026-06-26',
      start_time: '14:30',
      scheduled_at: '2026-06-26T14:30:00',
    })
  })
  it('guards empty input', () => {
    expect(fromDatetimeLocalValue('')).toEqual({ session_date: '', start_time: '', scheduled_at: '' })
  })
})

describe('appointmentDurationMinutes', () => {
  it('computes from start/end times', () => {
    expect(appointmentDurationMinutes({ start_time: '09:00', end_time: '10:00' })).toBe(60)
  })
  it('falls back to 60 for missing/invalid ranges', () => {
    expect(appointmentDurationMinutes({})).toBe(60)
    expect(appointmentDurationMinutes({ start_time: '10:00', end_time: '09:00' })).toBe(60)
    expect(appointmentDurationMinutes(null)).toBe(60)
  })
})

describe('labels', () => {
  it('appointmentTypeLabel maps known types, echoes unknown', () => {
    expect(appointmentTypeLabel('one_to_one')).toBe('1:1 session')
    expect(appointmentTypeLabel('mystery')).toBe('mystery')
  })
  it('attendanceLabel', () => {
    expect(attendanceLabel(null)).toBe('Not logged')
    expect(attendanceLabel('attended')).toBe('Attended')
  })
  it('attendanceBadgeClass', () => {
    expect(attendanceBadgeClass('attended')).toBe('badge-green')
    expect(attendanceBadgeClass('cancelled')).toBe('badge-grey')
    expect(attendanceBadgeClass(null)).toBe('badge-blue')
  })
})

describe('formatSessionDateTime', () => {
  it('joins date and time', () => {
    expect(formatSessionDateTime({ session_date: '2026-06-26', start_time: '14:00' }))
      .toBe('26 Jun 2026 · 14:00')
  })
})

describe('agenda grouping', () => {
  it('formatAgendaDayHeading tags today/tomorrow', () => {
    expect(formatAgendaDayHeading(DEMO_TODAY, { relative: true })).toMatch(/^Today · /)
    expect(formatAgendaDayHeading(addDaysYmd(DEMO_TODAY, 1), { relative: true })).toMatch(/^Tomorrow · /)
  })
  it('buckets appointments and drops the past', () => {
    const appts = [
      { id: 'a', session_date: DEMO_TODAY, start_time: '11:00' },
      { id: 'b', session_date: DEMO_TODAY, start_time: '09:00' },
      { id: 'c', session_date: addDaysYmd(DEMO_TODAY, 1), start_time: '10:00' },
      { id: 'd', session_date: addDaysYmd(DEMO_TODAY, 5), start_time: '10:00' },
      { id: 'past', session_date: '2020-01-01', start_time: '10:00' },
    ]
    const groups = groupAppointmentsForAgenda(appts)
    const byKey = Object.fromEntries(groups.map(g => [g.key, g.items.map(i => i.id)]))
    expect(byKey.today).toEqual(['b', 'a']) // sorted by time
    expect(byKey.tomorrow).toEqual(['c'])
    expect(byKey.later).toEqual(['d'])
  })
})
