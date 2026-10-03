export const PRIVATE_PRACTICE_LOCATION_ID = 'private'

export const WEEKDAYS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
] as const

export type DayKey = (typeof WEEKDAYS)[number]['key']

export interface DayHours {
  enabled: boolean
  start: string
  end: string
}

export interface WorkplaceClinicianSetting {
  workplace_id: string
  weekly_hours: Record<DayKey, DayHours>
  service_ids: string[]
}

export interface ClinicianLocation {
  id: string
  name: string
  role?: string | null
}

export function defaultDayHours(enabled = false): DayHours {
  return { enabled, start: '09:00', end: '17:00' }
}

export function defaultWeeklyHours(): Record<DayKey, DayHours> {
  return {
    mon: defaultDayHours(true),
    tue: defaultDayHours(true),
    wed: defaultDayHours(true),
    thu: defaultDayHours(true),
    fri: defaultDayHours(true),
    sat: defaultDayHours(false),
    sun: defaultDayHours(false),
  }
}

export function normalizeWeeklyHours(raw: Record<string, unknown> | null | undefined): Record<DayKey, DayHours> {
  const base = defaultWeeklyHours()
  if (!raw) return base
  for (const day of WEEKDAYS) {
    const entry = raw[day.key] as DayHours | undefined
    if (!entry) continue
    base[day.key] = {
      enabled: Boolean(entry.enabled),
      start: String(entry.start || '09:00'),
      end: String(entry.end || '17:00'),
    }
  }
  return base
}

export function normalizeWorkplaceSetting(raw: Record<string, unknown>): WorkplaceClinicianSetting {
  return {
    workplace_id: String(raw.workplace_id),
    weekly_hours: normalizeWeeklyHours(raw.weekly_hours as Record<string, unknown>),
    service_ids: Array.isArray(raw.service_ids) ? raw.service_ids.map(String) : [],
  }
}

export function normalizeWorkplaceSettings(raw: unknown): WorkplaceClinicianSetting[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => normalizeWorkplaceSetting(item as Record<string, unknown>))
}

export function buildClinicianLocations(
  memberships: Array<{ workplace_id?: string; id?: string; name?: string; role?: string }>,
  workplacesById: Map<string, { name?: string }>,
): ClinicianLocation[] {
  const locations: ClinicianLocation[] = memberships.map(m => {
    const workplaceId = m.workplace_id || m.id || ''
    const workplace = workplacesById.get(workplaceId)
    return {
      id: workplaceId,
      name: m.name || workplace?.name || 'Workplace',
      role: m.role || null,
    }
  })

  locations.push({
    id: PRIVATE_PRACTICE_LOCATION_ID,
    name: 'Private practice',
    role: null,
  })

  return locations
}

export function getSettingsForLocation(
  settings: WorkplaceClinicianSetting[],
  workplaceId: string,
): WorkplaceClinicianSetting {
  const existing = settings.find(s => s.workplace_id === workplaceId)
  if (existing) return existing
  return {
    workplace_id: workplaceId,
    weekly_hours: defaultWeeklyHours(),
    service_ids: [],
  }
}

export function mergeSettingsForLocations(
  settings: WorkplaceClinicianSetting[],
  locationIds: string[],
): WorkplaceClinicianSetting[] {
  return locationIds.map(id => getSettingsForLocation(settings, id))
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return 0
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

export function hoursOverlap(a: DayHours, b: DayHours): boolean {
  if (!a.enabled || !b.enabled) return false
  const aStart = timeToMinutes(a.start)
  const aEnd = timeToMinutes(a.end)
  const bStart = timeToMinutes(b.start)
  const bEnd = timeToMinutes(b.end)
  if (aEnd <= aStart || bEnd <= bStart) return false
  return aStart < bEnd && bStart < aEnd
}

export interface OverlapResolution {
  settings: WorkplaceClinicianSetting[]
  cleared: Array<{ workplace_id: string; day: DayKey }>
}

/** Apply hours at one location; disable overlapping slots at other locations (latest edit wins). */
export function applyDayHoursWithOverlapResolution(
  settings: WorkplaceClinicianSetting[],
  workplaceId: string,
  dayKey: DayKey,
  patch: Partial<DayHours>,
): OverlapResolution {
  const cleared: OverlapResolution['cleared'] = []
  const next = settings.map(setting => ({
    ...setting,
    weekly_hours: { ...setting.weekly_hours },
    service_ids: [...setting.service_ids],
  }))

  const targetIdx = next.findIndex(s => s.workplace_id === workplaceId)
  if (targetIdx === -1) return { settings: next, cleared }

  const updatedDay = { ...next[targetIdx].weekly_hours[dayKey], ...patch }
  next[targetIdx].weekly_hours[dayKey] = updatedDay

  if (!updatedDay.enabled) return { settings: next, cleared }

  for (let i = 0; i < next.length; i++) {
    if (i === targetIdx) continue
    const otherDay = next[i].weekly_hours[dayKey]
    if (hoursOverlap(updatedDay, otherDay)) {
      next[i].weekly_hours[dayKey] = { ...otherDay, enabled: false }
      cleared.push({ workplace_id: next[i].workplace_id, day: dayKey })
    }
  }

  return { settings: next, cleared }
}

function formatTimeShort(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour12 = h % 12 || 12
  return m ? `${hour12}:${String(m).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`
}

/** Human-readable summary, e.g. "Mon–Fri 9:00am–5:00pm". */
export function formatWeeklyHoursSummary(weeklyHours: Record<DayKey, DayHours>): string {
  const enabledDays = WEEKDAYS.filter(day => weeklyHours[day.key]?.enabled)
  if (!enabledDays.length) return 'No hours set'

  const first = weeklyHours[enabledDays[0].key]
  const sameHours = enabledDays.every(day => {
    const hours = weeklyHours[day.key]
    return hours.start === first.start && hours.end === first.end
  })

  const rangeLabel = enabledDays.length > 1
    ? `${enabledDays[0].short}–${enabledDays[enabledDays.length - 1].short}`
    : enabledDays[0].short

  if (!sameHours) {
    return enabledDays
      .map(day => {
        const hours = weeklyHours[day.key]
        return `${day.short} ${formatTimeShort(hours.start)}–${formatTimeShort(hours.end)}`
      })
      .join(', ')
  }

  return `${rangeLabel} ${formatTimeShort(first.start)}–${formatTimeShort(first.end)}`
}

export function resolveOfferedServiceNames(
  setting: WorkplaceClinicianSetting | null | undefined,
  services: Array<{ id?: string; name?: string }>,
): string[] {
  if (!setting?.service_ids?.length) return []
  const byId = new Map(services.map(s => [s.id, s.name]))
  return setting.service_ids.map(id => byId.get(id)).filter(Boolean) as string[]
}

export function profileInitials(fullName: string | null | undefined): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
