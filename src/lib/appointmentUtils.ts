import { APPOINTMENT_TYPES, ATTENDANCE_STATUSES } from './mockData'
import { compareYmd, compareTime, formatDisplayDate, DEMO_TODAY, addDaysYmd } from './dateArchitecture'

export interface AppointmentLike {
  session_date?: string
  start_time?: string
  end_time?: string
  scheduled_at?: string
  appointment_type?: string
  attendance_status?: string | null
  location?: string
  other_info?: string
  notes?: string
}

export function appointmentSchedule(appt: AppointmentLike | null | undefined) {
  if (!appt) return { session_date: '', start_time: '' }
  if (appt.session_date && appt.start_time) {
    return { session_date: appt.session_date, start_time: appt.start_time }
  }
  if (appt.scheduled_at) {
    const d = new Date(appt.scheduled_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      session_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      start_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    }
  }
  return { session_date: '', start_time: '' }
}

export function appointmentInstant(appt: AppointmentLike | null | undefined): string {
  const { session_date, start_time } = appointmentSchedule(appt)
  if (!session_date) return ''
  return `${session_date}T${start_time || '00:00'}:00`
}

export function formatAppointmentDateTime(apptOrIso: AppointmentLike | string | null | undefined): string {
  const iso = typeof apptOrIso === 'object' ? appointmentInstant(apptOrIso) : apptOrIso
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatAppointmentDate(apptOrIso: AppointmentLike | string | null | undefined): string {
  if (typeof apptOrIso === 'object' && apptOrIso?.session_date) {
    return formatDisplayDate(apptOrIso.session_date)
  }
  const iso = typeof apptOrIso === 'string' ? apptOrIso : appointmentInstant(apptOrIso)
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function toDatetimeLocalValue(source: AppointmentLike | string | null | undefined): string {
  const iso = typeof source === 'object' ? appointmentInstant(source) : source
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string) {
  if (!value) return { session_date: '', start_time: '', scheduled_at: '' }
  const [datePart, timePart] = value.split('T')
  const start_time = (timePart || '00:00').slice(0, 5)
  return {
    session_date: datePart,
    start_time,
    scheduled_at: `${datePart}T${start_time}:00`,
  }
}

export function sessionDateFromAppointment(apptOrIso: AppointmentLike | string): string {
  if (typeof apptOrIso === 'object') {
    return appointmentSchedule(apptOrIso).session_date
  }
  const d = new Date(apptOrIso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatAppointmentTime(apptOrIso: AppointmentLike | string | null | undefined): string {
  if (typeof apptOrIso === 'object' && apptOrIso?.start_time) {
    return apptOrIso.start_time
  }
  const iso = typeof apptOrIso === 'string' ? apptOrIso : appointmentInstant(apptOrIso)
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Date + time for lists — e.g. "26 Jun 2026 · 14:00" */
export function formatSessionDateTime(appt: AppointmentLike | null | undefined): string {
  const { session_date, start_time } = appointmentSchedule(appt)
  if (!session_date) return ''
  const datePart = formatDisplayDate(session_date)
  return start_time ? `${datePart} · ${start_time}` : datePart
}

export function appointmentTypeLabel(type: string | null | undefined): string {
  return APPOINTMENT_TYPES[type as keyof typeof APPOINTMENT_TYPES] || type || ''
}

export function attendanceLabel(status: string | null | undefined): string {
  if (!status) return 'Not logged'
  return ATTENDANCE_STATUSES[status as keyof typeof ATTENDANCE_STATUSES] || status
}

export function attendanceBadgeClass(status: string | null | undefined): string {
  if (status === 'attended') return 'badge-green'
  if (status === 'did_not_attend') return 'badge-grey'
  if (status === 'cancelled') return 'badge-grey'
  return 'badge-blue'
}

export function appointmentOtherInfo(appt: { other_info?: string; notes?: string } | null | undefined): string {
  const raw = appt?.other_info ?? appt?.notes ?? ''
  if (!raw) return ''
  return String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseTimeMinutes(time: string | null | undefined): number {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function appointmentDurationMinutes(appt: AppointmentLike | null | undefined): number {
  if (!appt) return 60
  if (appt.end_time && appt.start_time) {
    const diff = parseTimeMinutes(appt.end_time) - parseTimeMinutes(appt.start_time)
    return diff > 0 ? diff : 60
  }
  return 60
}

export function formatAgendaDayHeading(ymd: string, { relative = false }: { relative?: boolean } = {}): string {
  const label = formatDisplayDate(ymd)
  if (!relative) return label
  if (ymd === DEMO_TODAY) return `Today · ${label}`
  if (ymd === addDaysYmd(DEMO_TODAY, 1)) return `Tomorrow · ${label}`
  return label
}

export function groupAppointmentsForAgenda(appointments: AppointmentLike[]) {
  const today = DEMO_TODAY
  const tomorrow = addDaysYmd(today, 1)

  const todayItems: AppointmentLike[] = []
  const tomorrowItems: AppointmentLike[] = []
  const laterItems: AppointmentLike[] = []

  for (const appt of appointments) {
    const { session_date } = appointmentSchedule(appt)
    if (session_date === today) todayItems.push(appt)
    else if (session_date === tomorrow) tomorrowItems.push(appt)
    else if (compareYmd(session_date, today) > 0) laterItems.push(appt)
  }

  const sortByTime = (a: AppointmentLike, b: AppointmentLike) => compareTime(
    appointmentSchedule(a).start_time,
    appointmentSchedule(b).start_time,
  )

  return [
    { key: 'today', heading: formatAgendaDayHeading(today, { relative: true }), items: todayItems.sort(sortByTime) },
    { key: 'tomorrow', heading: formatAgendaDayHeading(tomorrow, { relative: true }), items: tomorrowItems.sort(sortByTime) },
    { key: 'later', heading: 'Later', items: laterItems.sort((a, b) => compareYmd(appointmentSchedule(a).session_date, appointmentSchedule(b).session_date)) },
  ]
}

export { APPOINTMENT_TYPES, ATTENDANCE_STATUSES }
