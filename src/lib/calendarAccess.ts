import { compareYmd, compareTime, appointmentTimeSlot } from './dateArchitecture'

/** True when this appointment belongs on the signed-in clinician's diary. */
export function appointmentMatchesPersona(appointment, persona) {
  if (!appointment || !persona) return false
  if (persona.userId && appointment.clinician_id === persona.userId) return true
  if (!appointment.assigned_therapist || !persona.name) return false
  const personaName = String(persona.name).trim()
  const personaFirst = personaName.split(/\s+/)[0]
  const assigned = String(appointment.assigned_therapist).trim()
  return assigned === personaName || assigned === personaFirst
}

export function filterAppointmentsForPersona(appointments, persona) {
  return appointments.filter(a => appointmentMatchesPersona(a, persona))
}

export function partitionAppointmentsByPersona(appointments, persona) {
  const visible = filterAppointmentsForPersona(appointments, persona)
  return { visible, total: appointments.length, hidden: appointments.length - visible.length }
}

export function sortAppointmentsChronological(appointments) {
  return [...appointments].sort((a, b) => {
    const dateCmp = compareYmd(a.session_date, b.session_date)
    if (dateCmp !== 0) return dateCmp
    return compareTime(a.start_time, b.start_time)
  })
}

/** Latest session date first — clinical list default. */
export function sortAppointmentsLatestFirst(appointments) {
  return [...appointments].sort((a, b) => {
    const dateCmp = compareYmd(b.session_date, a.session_date)
    if (dateCmp !== 0) return dateCmp
    return compareTime(b.start_time, a.start_time)
  })
}

export function appointmentsForDate(appointments, ymd) {
  return appointments.filter(a => a.session_date === ymd)
}

export function appointmentHourSlot(startTime) {
  return appointmentTimeSlot(startTime, 60)
}

export function appointmentHalfHourSlot(startTime) {
  return appointmentTimeSlot(startTime, 30)
}
