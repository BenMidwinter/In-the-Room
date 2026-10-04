/** Persisted calendar view preferences (localStorage). */

export const DEFAULT_CALENDAR_START_HOUR = 8
export const DEFAULT_CALENDAR_END_HOUR = 17
export const DEFAULT_CALENDAR_INTERVAL = 30

export const CALENDAR_INTERVAL_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
]

export const MIN_CALENDAR_INTERVAL = 15
export const MAX_CALENDAR_INTERVAL = 60

export const CALENDAR_START_HOUR_OPTIONS = [
  { value: 5, label: '5:00 am' },
  { value: 6, label: '6:00 am' },
  { value: 7, label: '7:00 am' },
  { value: 8, label: '8:00 am' },
  { value: 9, label: '9:00 am' },
  { value: 10, label: '10:00 am' },
  { value: 11, label: '11:00 am' },
  { value: 12, label: '12:00 pm' },
]

export const CALENDAR_END_HOUR_OPTIONS = [
  { value: 13, label: '1:00 pm' },
  { value: 14, label: '2:00 pm' },
  { value: 15, label: '3:00 pm' },
  { value: 16, label: '4:00 pm' },
  { value: 17, label: '5:00 pm' },
  { value: 18, label: '6:00 pm' },
  { value: 19, label: '7:00 pm' },
  { value: 20, label: '8:00 pm' },
  { value: 21, label: '9:00 pm' },
  { value: 22, label: '10:00 pm' },
]

const START_KEY = 'in-the-room-calendar-start-hour'
const END_KEY = 'in-the-room-calendar-end-hour'
const INTERVAL_KEY = 'in-the-room-calendar-interval'
const AVAIL_SYNC_KEY = 'in-the-room-calendar-avail-sync'

const ALLOWED_START_HOURS = CALENDAR_START_HOUR_OPTIONS.map(o => o.value)
const ALLOWED_END_HOURS = CALENDAR_END_HOUR_OPTIONS.map(o => o.value)

function toNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 30-minute view is the fitted size. 15 is a bit taller; 60 is a bit shorter. */
export function calendarHourScale(intervalMinutes: number): number {
  const n = Number(intervalMinutes)
  if (!Number.isFinite(n) || n <= 15) return 1.5
  if (n >= 60) return 0.75
  return 1
}

function snapInterval(value) {
  const n = toNumber(value, DEFAULT_CALENDAR_INTERVAL)
  let best = DEFAULT_CALENDAR_INTERVAL
  let bestDist = Number.POSITIVE_INFINITY
  for (const option of CALENDAR_INTERVAL_OPTIONS) {
    const dist = Math.abs(option.value - n)
    if (dist < bestDist) {
      best = option.value
      bestDist = dist
    }
  }
  return best
}

function snapToAllowed(value, allowed, fallback) {
  const n = toNumber(value, fallback)
  return allowed.includes(n) ? n : fallback
}

function nearestAllowed(value, allowed, fallback) {
  const n = toNumber(value, fallback)
  if (allowed.includes(n)) return n
  let best = fallback
  let bestDist = Number.POSITIVE_INFINITY
  for (const option of allowed) {
    const dist = Math.abs(option - n)
    if (dist < bestDist) {
      best = option
      bestDist = dist
    }
  }
  return best
}

export function normalizeCalendarViewPreferences({ startHour, endHour, intervalMinutes }) {
  let start = snapToAllowed(startHour, ALLOWED_START_HOURS, DEFAULT_CALENDAR_START_HOUR)
  let end = snapToAllowed(endHour, ALLOWED_END_HOURS, DEFAULT_CALENDAR_END_HOUR)

  if (start >= end) {
    start = DEFAULT_CALENDAR_START_HOUR
    end = DEFAULT_CALENDAR_END_HOUR
  }

  return {
    startHour: start,
    endHour: end,
    intervalMinutes: snapInterval(intervalMinutes),
  }
}

export function getDefaultCalendarViewPreferences() {
  return normalizeCalendarViewPreferences({
    startHour: DEFAULT_CALENDAR_START_HOUR,
    endHour: DEFAULT_CALENDAR_END_HOUR,
    intervalMinutes: DEFAULT_CALENDAR_INTERVAL,
  })
}

export function getCalendarViewPreferences() {
  try {
    const raw = {
      startHour: localStorage.getItem(START_KEY),
      endHour: localStorage.getItem(END_KEY),
      intervalMinutes: localStorage.getItem(INTERVAL_KEY),
    }
    // Migrate legacy default interval (15) to 30 when the user never customized it.
    if (raw.intervalMinutes === null) {
      raw.intervalMinutes = String(DEFAULT_CALENDAR_INTERVAL)
    }
    const normalized = normalizeCalendarViewPreferences(raw)

    if (
      String(normalized.startHour) !== raw.startHour
      || String(normalized.endHour) !== raw.endHour
      || String(normalized.intervalMinutes) !== raw.intervalMinutes
    ) {
      saveCalendarViewPreferences(normalized)
    }

    return normalized
  } catch {
    return getDefaultCalendarViewPreferences()
  }
}

export function saveCalendarViewPreferences(next) {
  const normalized = normalizeCalendarViewPreferences(next)
  try {
    localStorage.setItem(START_KEY, String(normalized.startHour))
    localStorage.setItem(END_KEY, String(normalized.endHour))
    localStorage.setItem(INTERVAL_KEY, String(normalized.intervalMinutes))
  } catch {
    /* ignore */
  }
  return normalized
}

/** Apply availability-derived window once per fingerprint (or when forced). */
export function syncCalendarPrefsFromAvailability(bounds, { force = false } = {}) {
  if (!bounds) return getCalendarViewPreferences()
  const fingerprint = `${bounds.startHour}-${bounds.endHour}`
  try {
    const previous = localStorage.getItem(AVAIL_SYNC_KEY)
    if (!force && previous === fingerprint) return getCalendarViewPreferences()
    localStorage.setItem(AVAIL_SYNC_KEY, fingerprint)
  } catch {
    /* ignore */
  }
  const current = getCalendarViewPreferences()
  return saveCalendarViewPreferences({
    startHour: nearestAllowed(bounds.startHour, ALLOWED_START_HOURS, DEFAULT_CALENDAR_START_HOUR),
    endHour: nearestAllowed(bounds.endHour, ALLOWED_END_HOURS, DEFAULT_CALENDAR_END_HOUR),
    intervalMinutes: current.intervalMinutes || DEFAULT_CALENDAR_INTERVAL,
  })
}
