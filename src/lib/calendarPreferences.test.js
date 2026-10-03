import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALENDAR_END_HOUR,
  DEFAULT_CALENDAR_START_HOUR,
  getDefaultCalendarViewPreferences,
  normalizeCalendarViewPreferences,
} from './calendarPreferences'

describe('normalizeCalendarViewPreferences', () => {
  it('defaults to 8:00–17:00 in 30-minute slots', () => {
    expect(getDefaultCalendarViewPreferences()).toEqual({
      startHour: 8,
      endHour: 17,
      intervalMinutes: 30,
    })
  })

  it('repairs empty end hour (previously parsed as 0)', () => {
    expect(normalizeCalendarViewPreferences({
      startHour: 9,
      endHour: '',
      intervalMinutes: 30,
    })).toEqual({
      startHour: 9,
      endHour: DEFAULT_CALENDAR_END_HOUR,
      intervalMinutes: 30,
    })
  })

  it('repairs zeroed hours without producing negative labels', () => {
    const prefs = normalizeCalendarViewPreferences({
      startHour: 0,
      endHour: 0,
      intervalMinutes: 30,
    })
    expect(prefs.startHour).toBeGreaterThanOrEqual(5)
    expect(prefs.endHour).toBeGreaterThan(prefs.startHour)
    expect(prefs.startHour).toBe(DEFAULT_CALENDAR_START_HOUR)
    expect(prefs.endHour).toBe(DEFAULT_CALENDAR_END_HOUR)
  })

  it('keeps valid custom ranges', () => {
    expect(normalizeCalendarViewPreferences({
      startHour: 7,
      endHour: 18,
      intervalMinutes: 30,
    })).toEqual({
      startHour: 7,
      endHour: 18,
      intervalMinutes: 30,
    })
  })

  it('snaps invalid end hour to the default end time', () => {
    expect(normalizeCalendarViewPreferences({
      startHour: 10,
      endHour: 9,
      intervalMinutes: 30,
    })).toEqual({
      startHour: 10,
      endHour: DEFAULT_CALENDAR_END_HOUR,
      intervalMinutes: 30,
    })
  })
})
