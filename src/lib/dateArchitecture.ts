/** Strict clinical date contract — all mock/UI dates use YYYY-MM-DD. */

export const DATE_FORMAT = 'YYYY-MM-DD'
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface MonthGridDay {
  ymd: string | null
  inMonth: boolean
}

export function isValidYmd(value: unknown): value is string {
  return typeof value === 'string' && DATE_REGEX.test(value)
}

/** Lexicographic sort — latest date first (clinical default). */
export function sortLatestFirst<T extends Record<string, unknown>>(items: T[], key = 'session_date'): T[] {
  return [...items].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')))
}

export function sortLatestFirstMulti<T extends Record<string, unknown>>(items: T[], keys: string[]): T[] {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const cmp = String(b[key] || '').localeCompare(String(a[key] || ''))
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function ymdParts(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** UTC-safe day index: 0 = Sunday … 6 = Saturday */
export function weekdayIndex(ymd: string): number {
  const { y, m, d } = ymdParts(ymd)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = ymdParts(ymd)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function startOfMonthYmd(ymd: string): string {
  const { y, m } = ymdParts(ymd)
  return `${y}-${pad2(m)}-01`
}

export function endOfMonthYmd(ymd: string): string {
  const { y, m } = ymdParts(ymd)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad2(m)}-${pad2(last)}`
}

export function daysInMonthYmd(ymd: string): number {
  const { y, m } = ymdParts(ymd)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function formatDisplayDate(ymd: string): string {
  if (!isValidYmd(ymd)) return ''
  const { y, m, d } = ymdParts(ymd)
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`
}

export function formatLongDate(ymd: string): string {
  if (!isValidYmd(ymd)) return ''
  const { y, m, d } = ymdParts(ymd)
  const wd = WEEKDAY_LONG[weekdayIndex(ymd)]
  return `${wd}, ${d} ${MONTH_LONG[m - 1]} ${y}`
}

export function formatWeekdayShort(ymd: string): string {
  return WEEKDAY_SHORT[weekdayIndex(ymd)]
}

export function compareYmd(a: string | null | undefined, b: string | null | undefined): number {
  return String(a || '').localeCompare(String(b || ''))
}

export function compareTime(a: string | null | undefined, b: string | null | undefined): number {
  return String(a || '').localeCompare(String(b || ''))
}

/** Calendar days from `fromYmd` to `toYmd` (can be negative). */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  if (!fromYmd || !toYmd) return 0
  const a = ymdParts(fromYmd)
  const b = ymdParts(toYmd)
  const msA = Date.UTC(a.y, a.m - 1, a.d)
  const msB = Date.UTC(b.y, b.m - 1, b.d)
  return Math.round((msB - msA) / 86400000)
}

/** Demo anchor — avoids Date objects in React state for “today”. */
export const DEMO_TODAY = '2026-06-26'

export function monthGridDays(activeYmd: string): MonthGridDay[] {
  const first = startOfMonthYmd(activeYmd)
  const totalDays = daysInMonthYmd(activeYmd)
  const startPad = weekdayIndex(first)
  const cells: MonthGridDay[] = []

  for (let i = 0; i < startPad; i += 1) {
    cells.push({ ymd: null, inMonth: false })
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const { y, m } = ymdParts(first)
    cells.push({ ymd: toYmd(y, m, day), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ ymd: null, inMonth: false })
  }
  while (cells.length < 35) {
    cells.push({ ymd: null, inMonth: false })
  }
  return cells.slice(0, 35)
}

export function weekDatesYmd(activeYmd: string): string[] {
  const sunday = addDaysYmd(activeYmd, -weekdayIndex(activeYmd))
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(sunday, i))
}

export function workingWeekDatesYmd(activeYmd: string): string[] {
  const mondayOffset = (weekdayIndex(activeYmd) + 6) % 7
  const monday = addDaysYmd(activeYmd, -mondayOffset)
  return Array.from({ length: 5 }, (_, i) => addDaysYmd(monday, i))
}

export const CALENDAR_HOURS = Array.from({ length: 11 }, (_, i) => `${pad2(8 + i)}:00`)

export const CALENDAR_START_HOUR_OPTIONS = [6, 7, 8, 9, 10]
export const CALENDAR_END_HOUR_OPTIONS = [16, 17, 18, 19, 20]

export function addMinutesToTime(time: string | null | undefined, minutes: number): string {
  if (!time) return '09:00'
  const [h, m] = String(time).split(':').map(Number)
  let total = (h || 0) * 60 + (m || 0) + minutes
  total = ((total % (24 * 60)) + (24 * 60)) % (24 * 60)
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

/** Half-hour (or custom) slot starts between startHour and endHour (exclusive end). */
export function buildCalendarTimeSlots(startHour = 8, endHour = 18, intervalMinutes = 30): string[] {
  const slots: string[] = []
  let cursor = startHour * 60
  const end = endHour * 60
  while (cursor < end) {
    slots.push(`${pad2(Math.floor(cursor / 60))}:${pad2(cursor % 60)}`)
    cursor += intervalMinutes
  }
  return slots
}

/** Map an appointment start time to its grid slot key. */
export function appointmentTimeSlot(startTime: string | null | undefined, intervalMinutes = 30): string | null {
  if (!startTime) return null
  const [h, m] = startTime.split(':').map(Number)
  const total = (h || 0) * 60 + (m || 0)
  const floored = Math.floor(total / intervalMinutes) * intervalMinutes
  return `${pad2(Math.floor(floored / 60))}:${pad2(floored % 60)}`
}
