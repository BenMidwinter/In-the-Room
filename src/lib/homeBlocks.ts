import { getProgressNoteByAppointment } from './store'
import { compareYmd, todayYmd } from './dateArchitecture'
import { appointmentSchedule } from './appointmentUtils'
import { isProgressNoteSignedOff } from './progressNoteLifecycle'

function sortUpcomingSoonestFirst(items) {
  return [...items].sort((a, b) => {
    const dateCmp = String(a.session_date || '').localeCompare(String(b.session_date || ''))
    if (dateCmp !== 0) return dateCmp
    return String(a.start_time || '').localeCompare(String(b.start_time || ''))
  })
}

/**
 * Next progress note that still needs completing — oldest incomplete first.
 * Includes draft notes and past/attended sessions with no note yet.
 */
export function getNextProgressNoteTask(
  appointments: Array<Record<string, any>> = [],
  {
    getNote = getProgressNoteByAppointment,
    today = todayYmd(),
  } = {},
) {
  const candidates = appointments.filter((appt) => {
    if (!appt?.id || appt.is_external_busy) return false
    if (appt.attendance_status === 'cancelled' || appt.attendance_status === 'did_not_attend') return false
    const blockRole = appt.block_role
    if (blockRole === 'support' || blockRole === 'admin' || blockRole === 'busy') return false

    const note = getNote(appt.id)
    if (note && isProgressNoteSignedOff(note)) return false
    if (note) return true

    const { session_date } = appointmentSchedule(appt)
    if (appt.attendance_status === 'attended') return true
    return compareYmd(session_date, today) < 0
  })

  return sortUpcomingSoonestFirst(candidates)[0] || null
}
