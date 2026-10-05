import { addDaysYmd, daysBetweenYmd, startOfMonthYmd } from './dateArchitecture'
import { dayKeyFromYmd, timeToMinutes, type WorkplaceClinicianSetting } from './clinicianAvailability'
import {
  chargeForAttendance,
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
} from './cancellationPolicy'

export type ReportRange = { from: string; to: string }

export function rollingWeekRange(today: string): ReportRange {
  return { from: addDaysYmd(today, -6), to: today }
}

export function monthToDateRange(today: string): ReportRange {
  return { from: startOfMonthYmd(today), to: today }
}

export function quarterToDateRange(today: string): ReportRange {
  const [year, month] = today.split('-').map(Number)
  const startMonth = Math.floor(((month || 1) - 1) / 3) * 3 + 1
  return { from: `${year}-${String(startMonth).padStart(2, '0')}-01`, to: today }
}

export function inDateRange(ymd: string, range: ReportRange): boolean {
  return Boolean(ymd) && ymd >= range.from && ymd <= range.to
}

export function eachDate(range: ReportRange): string[] {
  const span = daysBetweenYmd(range.from, range.to)
  if (span < 0) return []
  const dates = []
  for (let offset = 0; offset <= span; offset += 1) dates.push(addDaysYmd(range.from, offset))
  return dates
}

export function availabilityMinutes(
  settings: WorkplaceClinicianSetting[] = [],
  range: ReportRange,
): number {
  let total = 0
  for (const ymd of eachDate(range)) {
    const key = dayKeyFromYmd(ymd)
    for (const setting of settings) {
      const day = setting.weekly_hours?.[key]
      if (!day?.enabled) continue
      const start = timeToMinutes(day.start)
      const end = timeToMinutes(day.end)
      if (end > start) total += end - start
    }
  }
  return total
}

export function slotMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime || '00:00')
  const end = timeToMinutes(endTime || '00:00')
  return end > start ? end - start : 0
}

export function formatHoursFromMinutes(minutes: number): string {
  const hours = Math.round((Number(minutes) / 60) * 10) / 10
  return `${hours}h`
}

export function efficiencyFromMinutes({
  availability,
  busy,
  appointment,
  support,
  admin,
}: {
  availability: number
  busy: number
  appointment: number
  support: number
  admin: number
}) {
  const bookable = availability - busy
  const used = appointment + support + admin
  const open = bookable - used
  const bookableForRate = Math.max(0, bookable)
  const rate = bookableForRate === 0 ? null : Math.round((used / bookableForRate) * 100)
  return { bookable, used, open, rate }
}

export type ReportAppointment = {
  id: string
  clientId: string | null
  clientName: string
  serviceId: string | null
  serviceName: string
  sessionDate: string
  startTime: string
  endTime: string
  attendance: string | null
  blockRole: string
  externalBusy: boolean
  doNotInvoice: boolean
  chargedPence: number | null
  feePence: number | null
  feeIncludesVat: boolean
}

export type NoteState = 'complete' | 'draft' | 'missing'

export function noteStateFor(notes: Array<{ status?: string | null }> = []): NoteState {
  if (notes.some((note) => note.status === 'signed_off')) return 'complete'
  if (notes.length) return 'draft'
  return 'missing'
}

export function roleOf(appointment: Pick<ReportAppointment, 'blockRole' | 'externalBusy'>): string {
  if (appointment.externalBusy || appointment.blockRole === 'busy') return 'busy'
  if (appointment.blockRole === 'support') return 'support'
  if (appointment.blockRole === 'admin') return 'admin'
  return 'appointment'
}

export function billablePence(
  appointment: Pick<ReportAppointment, 'attendance' | 'sessionDate' | 'startTime' | 'doNotInvoice' | 'chargedPence' | 'feePence'>,
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
): number {
  if (appointment.doNotInvoice) return 0
  if (appointment.chargedPence != null) return appointment.chargedPence
  if (!appointment.attendance) return 0
  const charge = chargeForAttendance({
    attendance: appointment.attendance,
    sessionDate: appointment.sessionDate,
    startTime: appointment.startTime,
    markedAt: sessionStartFrom(appointment.sessionDate, appointment.startTime),
    feePence: appointment.feePence,
    policy,
    doNotInvoice: false,
  })
  return charge.chargedPence || 0
}

function sessionStartFrom(sessionDate: string, startTime: string): Date {
  const [year, month, day] = sessionDate.split('-').map(Number)
  const [hour, minute] = String(startTime || '00:00').split(':').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0)
}

export function timeBuckets(appointments: ReportAppointment[], range: ReportRange) {
  const totals = { busy: 0, appointment: 0, support: 0, admin: 0 }
  for (const appointment of appointments) {
    if (!inDateRange(appointment.sessionDate, range)) continue
    if (appointment.attendance === 'cancelled') continue
    const role = roleOf(appointment)
    const minutes = slotMinutes(appointment.startTime, appointment.endTime)
    if (role === 'busy') totals.busy += minutes
    else if (role === 'support') totals.support += minutes
    else if (role === 'admin') totals.admin += minutes
    else totals.appointment += minutes
  }
  return totals
}

export type PracticeSummary = {
  deliveredMinutes: number
  attended: number
  dna: number
  cancelled: number
  earnedPence: number
  notesToFinish: number
  byService: Array<{ serviceId: string; name: string; minutes: number; sessions: number; earnedPence: number }>
  rows: Array<{
    id: string
    sessionDate: string
    clientName: string
    serviceName: string
    attendance: string | null
    note: NoteState
    earnedPence: number
    clientId: string | null
  }>
}

export function summariseAppointments(
  appointments: ReportAppointment[],
  range: ReportRange,
  notesByAppointment: Map<string, NoteState>,
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
): PracticeSummary {
  const byService = new Map<string, { serviceId: string; name: string; minutes: number; sessions: number; earnedPence: number }>()
  const rows = []
  let deliveredMinutes = 0
  let attended = 0
  let dna = 0
  let cancelled = 0
  let earnedPence = 0
  let notesToFinish = 0

  for (const appointment of appointments) {
    if (roleOf(appointment) !== 'appointment') continue
    if (!inDateRange(appointment.sessionDate, range)) continue
    const earned = billablePence(appointment, policy)
    const note = notesByAppointment.get(appointment.id) || 'missing'
    if (appointment.attendance === 'attended') {
      attended += 1
      deliveredMinutes += slotMinutes(appointment.startTime, appointment.endTime)
      if (note !== 'complete') notesToFinish += 1
    } else if (appointment.attendance === 'did_not_attend') dna += 1
    else if (appointment.attendance === 'cancelled') cancelled += 1

    earnedPence += earned
    const key = appointment.serviceId || 'none'
    const current = byService.get(key) || {
      serviceId: key,
      name: appointment.serviceName || 'No service',
      minutes: 0,
      sessions: 0,
      earnedPence: 0,
    }
    if (appointment.attendance !== 'cancelled') {
      current.minutes += slotMinutes(appointment.startTime, appointment.endTime)
    }
    if (appointment.attendance === 'attended') current.sessions += 1
    current.earnedPence += earned
    byService.set(key, current)

    rows.push({
      id: appointment.id,
      sessionDate: appointment.sessionDate,
      clientName: appointment.clientName,
      serviceName: appointment.serviceName || '—',
      attendance: appointment.attendance,
      note,
      earnedPence: earned,
      clientId: appointment.clientId,
    })
  }

  rows.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.clientName.localeCompare(b.clientName))

  return {
    deliveredMinutes,
    attended,
    dna,
    cancelled,
    earnedPence,
    notesToFinish,
    byService: [...byService.values()].sort((a, b) => b.earnedPence - a.earnedPence || a.name.localeCompare(b.name)),
    rows,
  }
}

export function averageWaitDays(createdAts: string[], today: string): number | null {
  if (!createdAts.length) return null
  const total = createdAts.reduce((sum, iso) => {
    const ymd = String(iso || '').slice(0, 10)
    if (!ymd) return sum
    return sum + Math.max(0, daysBetweenYmd(ymd, today))
  }, 0)
  return Math.round((total / createdAts.length) * 10) / 10
}

export type PracticeLogSource = {
  id: string
  occurred_on: string
  minutes: number
  label?: string | null
  direction?: string | null
}

export type PracticeActivity = {
  id: string
  date: string
  kind: string
  activity: string
  service: string
  minutes: number
}

export function formatPracticeHours(minutes: number): string {
  const hours = Math.round((Number(minutes) / 60) * 100) / 100
  return `${hours}h`
}

export function practiceActivities(
  appointments: ReportAppointment[],
  logs: { cpd?: PracticeLogSource[]; supervision?: PracticeLogSource[] },
  range: ReportRange,
  serviceId = '',
): PracticeActivity[] {
  const rows: PracticeActivity[] = []
  for (const appointment of appointments) {
    if (roleOf(appointment) !== 'appointment') continue
    if (appointment.attendance !== 'attended') continue
    if (!inDateRange(appointment.sessionDate, range)) continue
    if (serviceId && appointment.serviceId !== serviceId) continue
    rows.push({
      id: `clinical:${appointment.id}`,
      date: appointment.sessionDate,
      kind: 'Clinical',
      activity: appointment.clientName || '—',
      service: appointment.serviceName || '—',
      minutes: slotMinutes(appointment.startTime, appointment.endTime),
    })
  }
  for (const entry of logs.cpd || []) {
    if (!inDateRange(String(entry.occurred_on || '').slice(0, 10), range)) continue
    rows.push({
      id: `cpd:${entry.id}`,
      date: String(entry.occurred_on).slice(0, 10),
      kind: 'CPD',
      activity: String(entry.label || '').trim() || 'CPD',
      service: '—',
      minutes: Number(entry.minutes) || 0,
    })
  }
  for (const entry of logs.supervision || []) {
    if (!inDateRange(String(entry.occurred_on || '').slice(0, 10), range)) continue
    const direction = entry.direction === 'delivered' || entry.direction === 'received' ? entry.direction : ''
    rows.push({
      id: `supervision:${entry.id}`,
      date: String(entry.occurred_on).slice(0, 10),
      kind: direction === 'delivered'
        ? 'Supervision delivered'
        : direction === 'received'
          ? 'Supervision received'
          : 'Supervision',
      activity: String(entry.label || '').trim() || 'Supervision',
      service: '—',
      minutes: Number(entry.minutes) || 0,
    })
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || a.activity.localeCompare(b.activity))
  return rows
}

export function matchesClientTag(
  clientId: string | null | undefined,
  tagId: string,
  tagsByClient: Map<string, string[]>,
): boolean {
  if (!tagId) return true
  if (!clientId) return false
  return (tagsByClient.get(clientId) || []).includes(tagId)
}
