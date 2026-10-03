import { db, uid } from '../data/collections'
import { sortAppointmentsLatestFirst } from '../calendarAccess'
import { appointmentSchedule, fromDatetimeLocalValue, type AppointmentLike } from '../appointmentUtils'
import { DEMO_TODAY, addMinutesToTime } from '../dateArchitecture'
import { parseOrThrow, appointmentInputSchema } from '../schemas'
import { getClientsForUser } from './clientRecords'

export { APPOINTMENT_TYPES, ATTENDANCE_STATUSES } from '../mockData'

export function getAppointmentsForClient(clientId) {
  return sortAppointmentsLatestFirst(db.appointments.filter(a => a.client_id === clientId))
}

export function getAllAppointments() {
  return sortAppointmentsLatestFirst([...db.appointments])
}

export function getAppointment(appointmentId) {
  return db.appointments.find(a => a.id === appointmentId) || null
}

export function getUpcomingAppointments(userId, myWorkplace, options: { organisationWide?: boolean } = {}) {
  const { organisationWide = false } = options
  const clientIds = organisationWide
    ? new Set(db.clients.map(c => c.id))
    : new Set(getClientsForUser(userId, myWorkplace).map(c => c.id))
  const today = DEMO_TODAY
  return sortAppointmentsLatestFirst(
    db.appointments.filter(a => {
      if (!clientIds.has(String(a.client_id))) return false
      if (a.attendance_status === 'cancelled') return false
      const { session_date } = appointmentSchedule(a as AppointmentLike)
      return session_date >= today
    }),
  ).reverse()
}

export function saveAppointment(payload, userId) {
  payload = parseOrThrow(appointmentInputSchema, payload, 'Appointment')
  const now = new Date().toISOString().split('T')[0]
  const schedule = payload.session_date
    ? { session_date: payload.session_date, start_time: payload.start_time }
    : fromDatetimeLocalValue(payload.scheduled_at)

  const durationMinutes = payload.duration_minutes ?? 60
  const client = db.clients.find(c => c.id === payload.client_id)
  const clinicianProfile = db.profiles.find(p => p.id === (payload.clinician_id || userId))

  if (payload.id) {
    const idx = db.appointments.findIndex(a => a.id === payload.id)
    if (idx === -1) throw new Error('Appointment not found')
    const prev = db.appointments[idx]
    const startTime = schedule.start_time || prev.start_time
    db.appointments[idx] = {
      ...prev,
      episode_id: payload.episode_id ?? prev.episode_id,
      clinician_id: payload.clinician_id ?? prev.clinician_id,
      session_date: schedule.session_date || prev.session_date,
      start_time: startTime,
      end_time: payload.end_time ?? addMinutesToTime(startTime, durationMinutes),
      scheduled_at: `${schedule.session_date || prev.session_date}T${startTime}:00`,
      appointment_type: payload.appointment_type ?? prev.appointment_type,
      therapy_modality: payload.therapy_modality ?? prev.therapy_modality,
      attendance_status: payload.attendance_status !== undefined
        ? payload.attendance_status
        : prev.attendance_status,
      location: payload.location ?? prev.location ?? '',
      notes: payload.notes !== undefined ? payload.notes : prev.notes,
      other_info: payload.other_info !== undefined ? payload.other_info : prev.other_info ?? '',
      client_name: client?.real_name ?? prev.client_name,
      assigned_therapist: String(clinicianProfile?.full_name || '').split(' ')[0]
        || prev.assigned_therapist,
      updated_at: now,
    }
    return db.appointments[idx]
  }

  const startTime = schedule.start_time
  const created = {
    id: uid('appt'),
    client_id: payload.client_id,
    client_name: client?.real_name || `${client?.first_name || ''} ${client?.surname || ''}`.trim() || 'Client',
    episode_id: payload.episode_id || null,
    clinician_id: payload.clinician_id || userId,
    assigned_therapist: String(clinicianProfile?.full_name || '').split(' ')[0] || 'Clinician',
    session_date: schedule.session_date,
    start_time: startTime,
    end_time: payload.end_time ?? addMinutesToTime(startTime, durationMinutes),
    scheduled_at: `${schedule.session_date}T${startTime}:00`,
    therapy_modality: payload.therapy_modality || 'music_therapy',
    appointment_type: payload.appointment_type || 'one_to_one',
    attendance_status: payload.attendance_status ?? null,
    location: payload.location ?? '',
    notes: payload.notes || '',
    other_info: payload.other_info?.trim() || '',
    created_at: now,
    updated_at: now,
  }
  db.appointments.push(created)
  return created
}
