import { describe, it, expect } from 'vitest'
import {
  isValidYmd,
  sortLatestFirst,
  sortLatestFirstMulti,
  weekdayIndex,
  addDaysYmd,
  startOfMonthYmd,
  endOfMonthYmd,
  daysInMonthYmd,
  formatDisplayDate,
  formatLongDate,
  formatWeekdayShort,
  daysBetweenYmd,
  addMinutesToTime,
  buildCalendarTimeSlots,
  appointmentTimeSlot,
  monthGridDays,
  workingWeekDatesYmd,
} from './dateArchitecture'

describe('isValidYmd', () => {
  it('accepts YYYY-MM-DD and rejects everything else', () => {
    expect(isValidYmd('2026-06-26')).toBe(true)
    expect(isValidYmd('2026-6-6')).toBe(false)
    expect(isValidYmd('26/06/2026')).toBe(false)
    expect(isValidYmd(null)).toBe(false)
    expect(isValidYmd(20260626)).toBe(false)
  })
})

describe('sorting', () => {
  it('sortLatestFirst orders descending by key', () => {
    const items = [{ d: '2020-01-01' }, { d: '2022-05-05' }, { d: '2021-03-03' }]
    expect(sortLatestFirst(items, 'd').map(x => x.d)).toEqual(['2022-05-05', '2021-03-03', '2020-01-01'])
  })
  it('sortLatestFirst does not mutate the input', () => {
    const items = [{ d: '2020-01-01' }, { d: '2022-05-05' }]
    const copy = [...items]
    sortLatestFirst(items, 'd')
    expect(items).toEqual(copy)
  })
  it('sortLatestFirstMulti falls through to secondary key', () => {
    const items = [
      { d: '2022-01-01', t: '09:00' },
      { d: '2022-01-01', t: '14:00' },
    ]
    expect(sortLatestFirstMulti(items, ['d', 't']).map(x => x.t)).toEqual(['14:00', '09:00'])
  })
})

describe('calendar date math (UTC-safe)', () => {
  it('weekdayIndex is deterministic', () => {
    expect(weekdayIndex('2021-01-01')).toBe(5) // Friday
    expect(weekdayIndex('2026-06-28')).toBe(0) // Sunday
  })
  it('addDaysYmd crosses month and leap boundaries', () => {
    expect(addDaysYmd('2026-06-26', 1)).toBe('2026-06-27')
    expect(addDaysYmd('2026-02-28', 1)).toBe('2026-03-01') // 2026 not leap
    expect(addDaysYmd('2024-02-28', 1)).toBe('2024-02-29') // 2024 leap
    expect(addDaysYmd('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('month boundaries', () => {
    expect(startOfMonthYmd('2026-06-15')).toBe('2026-06-01')
    expect(endOfMonthYmd('2026-06-15')).toBe('2026-06-30')
    expect(endOfMonthYmd('2024-02-10')).toBe('2024-02-29')
    expect(daysInMonthYmd('2026-02-01')).toBe(28)
    expect(daysInMonthYmd('2024-02-01')).toBe(29)
  })
  it('daysBetweenYmd', () => {
    expect(daysBetweenYmd('2026-06-01', '2026-06-08')).toBe(7)
    expect(daysBetweenYmd('2026-06-08', '2026-06-01')).toBe(-7)
    expect(daysBetweenYmd('', '2026-06-01')).toBe(0)
  })
})

describe('formatting', () => {
  it('formatDisplayDate and guards', () => {
    expect(formatDisplayDate('2026-06-26')).toBe('26 Jun 2026')
    expect(formatDisplayDate('bad')).toBe('')
  })
  it('formatLongDate', () => {
    expect(formatLongDate('2026-06-26')).toBe('Friday, 26 June 2026')
  })
  it('formatWeekdayShort', () => {
    expect(formatWeekdayShort('2026-06-26')).toBe('Fri')
  })
})

describe('time helpers', () => {
  it('addMinutesToTime wraps around midnight and guards empty', () => {
    expect(addMinutesToTime('09:00', 90)).toBe('10:30')
    expect(addMinutesToTime('23:30', 60)).toBe('00:30')
    expect(addMinutesToTime('00:15', -30)).toBe('23:45')
    expect(addMinutesToTime('', 30)).toBe('09:00')
  })
  it('buildCalendarTimeSlots', () => {
    expect(buildCalendarTimeSlots(8, 10, 30)).toEqual(['08:00', '08:30', '09:00', '09:30'])
  })
  it('appointmentTimeSlot floors to interval', () => {
    expect(appointmentTimeSlot('09:45', 30)).toBe('09:30')
    expect(appointmentTimeSlot('10:00', 30)).toBe('10:00')
    expect(appointmentTimeSlot(null)).toBeNull()
  })
})

describe('grids', () => {
  it('monthGridDays returns a 35-cell grid with all month days', () => {
    const grid = monthGridDays('2026-06-01')
    expect(grid).toHaveLength(35)
    expect(grid.filter(c => c.inMonth)).toHaveLength(30)
  })
  it('workingWeekDatesYmd returns Mon–Fri', () => {
    const week = workingWeekDatesYmd('2026-06-24') // a Wednesday
    expect(week).toHaveLength(5)
    expect(week[0]).toBe('2026-06-22') // Monday
    expect(week[4]).toBe('2026-06-26') // Friday
  })
})
