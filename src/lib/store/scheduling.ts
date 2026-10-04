import { db, uid } from '../data/collections'
import { sortAppointmentsLatestFirst } from '../calendarAccess'
import { appointmentSchedule, fromDatetimeLocalValue, type AppointmentLike } from '../appointmentUtils'
import { todayYmd, addMinutesToTime } from '../dateArchitecture'
import { parseOrThrow, appointmentInputSchema } from '../schemas'
import { getClientsForUser } from './clientRecords'
import {
  assertWritableAppointment,
  blockRoleForServiceType,
  planFollowOnBlock,
  planFollowOnWrite,
  type ServiceFollowOnSource,
} from '../scheduling/appointmentHygiene'
import { resolveEpisodeAttachment } from '../scheduling/episodes'
import { activeLocalEpisode, openLocalEpisode } from './episodes'

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
  const today = todayYmd()
  return sortAppointmentsLatestFirst(
    db.appointments.filter(a => {
      if (a.attendance_status === 'cancelled' || a.attendance_status === 'attended') return false
      if ((a as { is_external_busy?: boolean }).is_external_busy) return false
      const role = (a as { block_role?: string | null }).block_role
      if (role === 'support' || role === 'admin' || role === 'busy') return false
      const { session_date } = appointmentSchedule(a as AppointmentLike)
      if (!session_date || session_date < today) return false
      if (!organisationWide && a.clinician_id && a.clinician_id === userId) return true
      return clientIds.has(String(a.client_id))
    }),
  ).reverse()
}

function asService(row: { id: string } | undefined): ServiceFollowOnSource | null {
  if (!row) return null
  return row as ServiceFollowOnSource
}

function syncLocalFollowOn(parent) {
  if (!parent?.id || parent.parent_appointment_id) return
  const existingIds = db.appointments
    .filter((row) => row.parent_appointment_id === parent.id)
    .map((row) => String(row.id))
  const role = parent.block_role || 'client_session'
  const primary = role === 'client_session'
    ? asService(db.orgServices.find((row) => row.id === parent.service_id))
    : null
  const followOn = primary?.follow_on_service_id
    ? asService(db.orgServices.find((row) => row.id === primary.follow_on_service_id))
    : null
  const write = planFollowOnWrite(existingIds, planFollowOnBlock(primary, followOn))

  if (write.deleteIds.length) {
    const drop = new Set(write.deleteIds)
    const kept = db.appointments.filter((row) => !drop.has(String(row.id)))
    db.appointments.length = 0
    for (const row of kept) db.appointments.push(row)
  }

  if (!write.plan) return

  const startTime = parent.end_time
  const endTime = addMinutesToTime(startTime, write.plan.durationMinutes)
  const child = {
    client_id: parent.client_id,
    client_name: parent.client_name,
    episode_id: parent.episode_id ?? null,
    clinician_id: parent.clinician_id,
    service_id: write.plan.serviceId,
    service_name: write.plan.serviceName,
    assigned_therapist: parent.assigned_therapist,
    session_date: parent.session_date,
    start_time: startTime,
    end_time: endTime,
    scheduled_at: `${parent.session_date}T${startTime}:00`,
    therapy_modality: write.plan.therapyModality,
    appointment_type: 'one_to_one',
    attendance_status: null,
    location: parent.location || '',
    notes: '',
    other_info: write.plan.serviceName,
    block_role: write.plan.blockRole,
    parent_appointment_id: parent.id,
    series_id: null,
    updated_at: parent.updated_at,
  }

  if (write.keepId) {
    const idx = db.appointments.findIndex((row) => row.id === write.keepId)
    if (idx !== -1) {
      db.appointments[idx] = { ...db.appointments[idx], ...child }
      return
    }
  }

  db.appointments.push({
    id: uid('appt'),
    created_at: parent.updated_at,
    ...child,
  })
}

/** Put existing appointments, their follow-on blocks, and their notes onto an episode. */
export function assignAppointmentsToEpisodeLocal(
  clientId: string,
  episodeId: string,
  appointmentIds: string[],
): string[] {
  const parents = new Set(appointmentIds.map((id) => String(id)))
  const moved: string[] = []
  for (const row of db.appointments) {
    if (String(row.client_id || '') !== clientId) continue
    if (row.parent_appointment_id) continue
    if (!parents.has(String(row.id))) continue
    row.episode_id = episodeId
    moved.push(String(row.id))
  }
  const movedParents = new Set(moved)
  for (const row of db.appointments) {
    const parentId = row.parent_appointment_id ? String(row.parent_appointment_id) : ''
    if (parentId && movedParents.has(parentId)) row.episode_id = episodeId
  }
  const touched = new Set(moved)
  for (const row of db.appointments) {
    const parentId = row.parent_appointment_id ? String(row.parent_appointment_id) : ''
    if (parentId && movedParents.has(parentId)) touched.add(String(row.id))
  }
  for (const note of db.progressNotes) {
    if (note.appointment_id && touched.has(String(note.appointment_id))) {
      note.episode_id = episodeId
    }
  }
  return moved
}

export function saveAppointment(payload, userId) {
  assertWritableAppointment(payload)
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
      client_id: payload.client_id !== undefined ? (payload.client_id || null) : prev.client_id,
      episode_id: payload.episode_id ?? prev.episode_id,
      clinician_id: payload.clinician_id ?? prev.clinician_id,
      service_id: payload.service_id !== undefined ? payload.service_id : prev.service_id,
      service_name: payload.service_name !== undefined ? payload.service_name : prev.service_name,
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
      block_role: payload.block_role ?? prev.block_role,
      series_id: payload.series_id !== undefined ? (payload.series_id || null) : prev.series_id,
      client_name: client?.real_name ?? prev.client_name,
      assigned_therapist: String(clinicianProfile?.full_name || '').split(' ')[0]
        || prev.assigned_therapist,
      updated_at: now,
    }
    const saved = db.appointments[idx]
    syncLocalFollowOn(saved)
    return saved
  }

  const startTime = schedule.start_time
  const blockRole = payload.block_role || blockRoleForServiceType(
    db.orgServices.find((row) => row.id === payload.service_id)?.service_type as string | undefined,
  )
  const clientId = typeof payload.client_id === 'string' && payload.client_id ? payload.client_id : null
  const requestedEpisodeId = typeof payload.episode_id === 'string' ? payload.episode_id : null
  const active = clientId ? activeLocalEpisode(clientId) : null
  const attachment = resolveEpisodeAttachment({
    blockRole,
    clientId,
    isCreate: true,
    requestedEpisodeId,
    existingEpisodeId: null,
    activeEpisodeId: active?.id ?? null,
  })
  const workplaceId = typeof client?.workplace_id === 'string' ? client.workplace_id : null
  const episodeId = attachment.open && clientId
    ? openLocalEpisode({
      clientId,
      ownerId: String(payload.clinician_id || userId),
      organizationId: workplaceId,
    }).id
    : attachment.episodeId

  const created = {
    id: uid('appt'),
    client_id: clientId,
    client_name: client?.real_name
      || `${client?.first_name || ''} ${client?.surname || ''}`.trim()
      || (clientId ? 'Client' : 'No client'),
    episode_id: episodeId,
    clinician_id: payload.clinician_id || userId,
    service_id: payload.service_id || null,
    service_name: payload.service_name || undefined,
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
    block_role: blockRole,
    parent_appointment_id: null,
    series_id: payload.series_id || null,
    created_at: now,
    updated_at: now,
  }
  db.appointments.push(created)
  syncLocalFollowOn(created)
  return created
}
