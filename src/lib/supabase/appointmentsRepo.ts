import { promoteWaitlistClient } from './clientsRepo'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { db } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import {
  getAllAppointments as getLocalAppointments,
  getAppointmentsForClient as getLocalClientAppointments,
  getAppointment as getLocalAppointment,
  getUpcomingAppointments as getLocalUpcoming,
  saveAppointment as saveLocalAppointment,
  assignAppointmentsToEpisodeLocal,
  setEpisodeAppointmentsLocal,
} from '../store/scheduling'
import { addMinutesToTime, todayYmd } from '../dateArchitecture'
import { appointmentSchedule, fromDatetimeLocalValue, type AppointmentLike } from '../appointmentUtils'
import { parseOrThrow, appointmentInputSchema } from '../schemas'
import { sortAppointmentsLatestFirst } from '../calendarAccess'
import { getClientsForUser } from '../store/clientRecords'
import { getServiceById, type ServiceRow } from './servicesRepo'
import { createMeetForAppointment, deleteGoogleEventsForAppointments } from './googleMeet'
import {
  assertWritableAppointment,
  blockRoleForServiceType,
  planFollowOnBlock,
  planFollowOnWrite,
} from '../scheduling/appointmentHygiene'
import { resolveEpisodeAttachment } from '../scheduling/episodes'
import { findActiveEpisode, openEpisode } from './episodesRepo'

type AppointmentExtras = {
  v: 0
  client_name: string
  assigned_therapist: string
  therapy_modality: string
  service_name?: string
  location: string
  notes: string
  other_info: string
  session_date: string
  start_time: string
  end_time: string
}

export type AppAppointment = {
  id: string
  client_id: string | null
  client_name: string
  episode_id: string | null
  clinician_id: string
  service_id?: string | null
  service_name?: string
  assigned_therapist: string
  session_date: string
  start_time: string
  end_time: string
  scheduled_at: string
  therapy_modality: string
  appointment_type: string
  attendance_status: string | null
  location: string
  notes: string
  other_info: string
  block_role?: string
  parent_appointment_id?: string | null
  series_id?: string | null
  created_at: string
  updated_at: string
  meet_url?: string
  is_external_busy?: boolean
  source?: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const [date, time = '00:00:00'] = String(iso).split('T')
    return { date, time: time.slice(0, 5) }
  }
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

function parseExtras(raw: Json | null | undefined): Partial<AppointmentExtras> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Partial<AppointmentExtras>
}

function toAppAppointment(row: {
  id: string
  client_id: string | null
  clinician_id: string
  episode_id: string | null
  service_id?: string | null
  appointment_type: string
  attendance_status: string | null
  starts_at: string
  ends_at: string
  block_role?: string
  parent_appointment_id?: string | null
  series_id?: string | null
  encrypted_payload: Json | null
  created_at: string
  updated_at: string
}): AppAppointment {
  const extras = parseExtras(row.encrypted_payload)
  const start = localParts(row.starts_at)
  const end = localParts(row.ends_at)
  const sessionDate = extras.session_date || start.date
  const startTime = extras.start_time || start.time
  const endTime = extras.end_time || end.time
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: extras.client_name || 'Client',
    episode_id: row.episode_id,
    clinician_id: row.clinician_id,
    service_id: row.service_id ?? null,
    service_name: extras.service_name || undefined,
    assigned_therapist: extras.assigned_therapist || 'Clinician',
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
    scheduled_at: `${sessionDate}T${startTime}:00`,
    therapy_modality: extras.therapy_modality || 'music_therapy',
    appointment_type: row.appointment_type || 'one_to_one',
    attendance_status: row.attendance_status,
    location: extras.location || '',
    notes: extras.notes || '',
    other_info: extras.other_info || '',
    block_role: row.block_role,
    parent_appointment_id: row.parent_appointment_id ?? null,
    series_id: row.series_id ?? null,
    created_at: row.created_at.slice(0, 10),
    updated_at: row.updated_at.slice(0, 10),
  }
}

async function resolveClinicianDisplayName(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  clinicianId: string,
): Promise<string> {
  const local = db.profiles.find((p) => p.id === clinicianId) as
    | { display_name?: string; full_name?: string; name?: string }
    | undefined
  const fromLocal = local?.display_name || local?.full_name || local?.name
  if (fromLocal) return String(fromLocal).trim()

  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', clinicianId)
    .maybeSingle()
  if (data?.display_name) {
    const name = String(data.display_name).trim()
    const idx = db.profiles.findIndex((p) => p.id === clinicianId)
    const row = { id: clinicianId, display_name: name, full_name: name }
    if (idx === -1) db.profiles.push(row as unknown as StoreRecord)
    else db.profiles[idx] = { ...db.profiles[idx], ...row }
    return name
  }
  return 'Clinician'
}

function hydrateLocal(appointments: AppAppointment[]) {
  db.appointments.length = 0
  for (const appt of appointments) {
    db.appointments.push(appt as unknown as StoreRecord)
  }
}

export async function listAppointmentsFromSupabase(): Promise<AppAppointment[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('appointments')
    .select('id, client_id, clinician_id, episode_id, service_id, appointment_type, attendance_status, starts_at, ends_at, block_role, parent_appointment_id, series_id, encrypted_payload, created_at, updated_at')
    .order('starts_at', { ascending: false })

  if (error) throw error
  const mapped = await attachMeetUrls((data || []).map((row) => toAppAppointment(row)))
  hydrateLocal(mapped)
  return mapped
}

export async function fetchAllAppointments(): Promise<AppAppointment[]> {
  if (!isSupabaseConfigured()) {
    return getLocalAppointments() as AppAppointment[]
  }
  return listAppointmentsFromSupabase()
}

export async function fetchAppointmentsForClient(clientId: string): Promise<AppAppointment[]> {
  if (!isSupabaseConfigured()) {
    return getLocalClientAppointments(clientId) as AppAppointment[]
  }
  const all = await listAppointmentsFromSupabase()
  return sortAppointmentsLatestFirst(all.filter((a) => a.client_id === clientId)) as AppAppointment[]
}

export async function fetchAppointment(appointmentId: string): Promise<AppAppointment | null> {
  if (!isSupabaseConfigured()) {
    return getLocalAppointment(appointmentId) as AppAppointment | null
  }
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('appointments')
    .select('id, client_id, clinician_id, episode_id, service_id, appointment_type, attendance_status, starts_at, ends_at, block_role, parent_appointment_id, series_id, encrypted_payload, created_at, updated_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [mapped] = await attachMeetUrls([toAppAppointment(data)])
  return mapped
}

export async function fetchUpcomingAppointments(
  userId: string,
  myWorkplace: unknown,
  options: { organisationWide?: boolean } = {},
): Promise<AppAppointment[]> {
  if (!isSupabaseConfigured()) {
    return getLocalUpcoming(userId, myWorkplace, options) as AppAppointment[]
  }
  const { organisationWide = false } = options
  const all = await listAppointmentsFromSupabase()
  const clientIds = organisationWide
    ? new Set(db.clients.map((c) => c.id))
    : new Set(getClientsForUser(userId, myWorkplace).map((c) => c.id))
  const today = todayYmd()
  return sortAppointmentsLatestFirst(
    all.filter((a) => {
      if (a.attendance_status === 'cancelled' || a.attendance_status === 'attended') return false
      if ((a as { is_external_busy?: boolean }).is_external_busy) return false
      const role = (a as { block_role?: string | null }).block_role
      // Real sessions use client_session (or null); skip follow-on/busy blocks.
      if (role === 'support' || role === 'admin' || role === 'busy') return false
      const { session_date } = appointmentSchedule(a as AppointmentLike)
      if (!session_date || session_date < today) return false
      // Prefer clinician assignment so upcoming still works before client cache hydrates.
      if (!organisationWide && a.clinician_id && a.clinician_id === userId) return true
      if (clientIds.size === 0) return !organisationWide && !a.clinician_id
      return clientIds.has(String(a.client_id))
    }),
  ).reverse() as AppAppointment[]
}

const APPOINTMENT_COLUMNS = 'id, client_id, clinician_id, episode_id, service_id, appointment_type, attendance_status, starts_at, ends_at, block_role, parent_appointment_id, series_id, encrypted_payload, created_at, updated_at'

async function attachMeetUrls(rows: AppAppointment[]): Promise<AppAppointment[]> {
  const supabase = getSupabase()
  if (!supabase || !rows.length) return rows
  const ids = rows.map((row) => row.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) return rows
  const { data, error } = await supabase
    .from('appointment_external_links')
    .select('appointment_id, meet_url')
    .in('appointment_id', ids)
  if (error || !data?.length) return rows
  const urls = new Map<string, string>()
  for (const link of data) {
    if (link.meet_url) urls.set(link.appointment_id, link.meet_url)
  }
  if (!urls.size) return rows
  return rows.map((row) => {
    const meetUrl = urls.get(row.id)
    return meetUrl ? { ...row, meet_url: meetUrl } : row
  })
}

function rememberLocal(appointment: AppAppointment) {
  const idx = db.appointments.findIndex((row) => row.id === appointment.id)
  if (idx === -1) db.appointments.push(appointment as unknown as StoreRecord)
  else db.appointments[idx] = appointment as unknown as StoreRecord
}

function forgetLocal(ids: string[]) {
  if (!ids.length) return
  const drop = new Set(ids)
  const kept = db.appointments.filter((row) => !drop.has(String(row.id)))
  db.appointments.length = 0
  for (const row of kept) db.appointments.push(row)
}

export async function upsertAppointmentRemote(
  payload: Record<string, unknown>,
  userId: string,
): Promise<AppAppointment> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  assertWritableAppointment(payload)
  payload = parseOrThrow(appointmentInputSchema, payload, 'Appointment') as Record<string, unknown>

  const existingId = payload.id && /^[0-9a-f-]{36}$/i.test(String(payload.id))
    ? String(payload.id)
    : null
  const existingLocal = existingId
    ? (db.appointments.find((a) => a.id === existingId) as AppAppointment | undefined)
    : undefined

  const schedule = payload.session_date
    ? { session_date: String(payload.session_date), start_time: String(payload.start_time || existingLocal?.start_time || '09:00') }
    : fromDatetimeLocalValue(String(payload.scheduled_at || ''))

  const durationMinutes = Number(
    payload.duration_minutes
    ?? (existingLocal
      ? Math.max(0, Number(parseMinutesSafe(existingLocal.end_time) - parseMinutesSafe(existingLocal.start_time))) || 60
      : 60),
  )
  const clientId = payload.client_id != null && payload.client_id !== ''
    ? String(payload.client_id)
    : (existingLocal?.client_id || null)
  const client = clientId
    ? (db.clients.find((c) => c.id === clientId) as
      | { real_name?: string; first_name?: string; surname?: string; workplace_id?: string | null }
      | undefined)
    : undefined
  const clinicianId = String(payload.clinician_id || existingLocal?.clinician_id || userId)
  const startTime = String(schedule.start_time || existingLocal?.start_time || '09:00')
  const endTime = payload.end_time
    ? String(payload.end_time)
    : (existingLocal?.end_time && !payload.duration_minutes && !payload.start_time
      ? existingLocal.end_time
      : addMinutesToTime(startTime, durationMinutes))
  const sessionDate = String(schedule.session_date || existingLocal?.session_date || '')
  const startsAt = new Date(`${sessionDate}T${startTime}:00`).toISOString()
  const endsAt = new Date(`${sessionDate}T${endTime}:00`).toISOString()

  const clientName = String(
    client?.real_name
    || `${client?.first_name || ''} ${client?.surname || ''}`.trim()
    || existingLocal?.client_name
    || (clientId ? 'Client' : 'No client'),
  )
  const assignedTherapist = await resolveClinicianDisplayName(supabase, clinicianId)

  const serviceIdRaw = payload.service_id !== undefined
    ? payload.service_id
    : existingLocal?.service_id
  const serviceId = serviceIdRaw && /^[0-9a-f-]{36}$/i.test(String(serviceIdRaw))
    ? String(serviceIdRaw)
    : null

  let serviceName = String(
    (payload as { service_name?: string }).service_name
    || existingLocal?.service_name
    || '',
  ).trim()
  let therapyModality = String(
    payload.therapy_modality
    || existingLocal?.therapy_modality
    || 'music_therapy',
  )
  let primaryService: ServiceRow | null = null
  let serviceLookupFailed = false
  if (serviceId) {
    try {
      primaryService = await getServiceById(serviceId)
      if (primaryService) {
        serviceName = primaryService.name
        therapyModality = primaryService.slug || therapyModality
      }
    } catch {
      serviceLookupFailed = true
    }
  }

  const previousExtras = existingLocal
    ? {
        location: existingLocal.location || '',
        notes: existingLocal.notes || '',
        other_info: existingLocal.other_info || '',
        service_name: existingLocal.service_name,
        therapy_modality: existingLocal.therapy_modality,
        client_name: existingLocal.client_name,
        assigned_therapist: existingLocal.assigned_therapist,
      }
    : null

  const extras: AppointmentExtras = {
    v: 0,
    client_name: clientName,
    assigned_therapist: assignedTherapist || previousExtras?.assigned_therapist || 'Clinician',
    therapy_modality: therapyModality,
    service_name: serviceName || previousExtras?.service_name || undefined,
    location: payload.location !== undefined
      ? String(payload.location ?? '')
      : (previousExtras?.location || ''),
    notes: payload.notes !== undefined
      ? String(payload.notes ?? '')
      : (previousExtras?.notes || ''),
    other_info: payload.other_info !== undefined
      ? String((payload.other_info as string | undefined)?.trim?.() || payload.other_info || '')
      : (previousExtras?.other_info || ''),
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
  }

  const seriesId = payload.series_id && /^[0-9a-f-]{36}$/i.test(String(payload.series_id))
    ? String(payload.series_id)
    : undefined

  const blockRole = String(
    payload.block_role
    || (primaryService ? blockRoleForServiceType(primaryService.service_type) : null)
    || existingLocal?.block_role
    || 'client_session',
  )

  const attendanceStatus = payload.attendance_status !== undefined
    ? (payload.attendance_status as string | null)
    : (existingLocal?.attendance_status ?? null)

  let episodeId: string | null = payload.episode_id !== undefined
    ? (payload.episode_id ? String(payload.episode_id) : null)
    : (existingLocal?.episode_id || null)

  if (!existingId) {
    const active = clientId ? await findActiveEpisode(clientId) : null
    const attachment = resolveEpisodeAttachment({
      blockRole,
      clientId,
      isCreate: true,
      requestedEpisodeId: payload.episode_id ? String(payload.episode_id) : null,
      existingEpisodeId: null,
      activeEpisodeId: active?.id ?? null,
    })
    if (attachment.open && clientId) {
      const opened = await openEpisode({
        clientId,
        ownerId: userId,
        organizationId: client?.workplace_id || null,
      })
      episodeId = opened.id
    } else {
      episodeId = attachment.episodeId
    }
  }

  const row = {
    owner_id: userId,
    organization_id: client?.workplace_id || null,
    client_id: clientId,
    clinician_id: clinicianId,
    episode_id: episodeId,
    service_id: serviceId,
    appointment_type: String(
      payload.appointment_type
      || existingLocal?.appointment_type
      || 'one_to_one',
    ),
    starts_at: startsAt,
    ends_at: endsAt,
    attendance_status: attendanceStatus,
    encrypted_payload: extras as unknown as Json,
    block_role: blockRole,
    ...(seriesId ? { series_id: seriesId } : {}),
  }

  if (existingId) {
    const { data, error } = await supabase
      .from('appointments')
      .update(row)
      .eq('id', existingId)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw error
    let mapped = toAppAppointment(data)
    rememberLocal(mapped)
    if (!data.parent_appointment_id && !serviceLookupFailed) {
      await syncRemoteFollowOn({
        parent: mapped,
        ownerId: userId,
        clinicianId,
        organizationId: row.organization_id,
        clientName,
        assignedTherapist,
        primary: blockRole === 'client_session' ? primaryService : null,
      })
    }
    mapped = await finishMeetLink(mapped, Boolean(payload.create_meet_link))
    if (blockRole === 'client_session' && clientId) await promoteWaitlistClient(clientId)
    return mapped
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert(row)
    .select(APPOINTMENT_COLUMNS)
    .single()
  if (error) throw error
  let mapped = toAppAppointment(data)
  rememberLocal(mapped)
  if (!serviceLookupFailed) {
    await syncRemoteFollowOn({
      parent: mapped,
      ownerId: userId,
      clinicianId,
      organizationId: row.organization_id,
      clientName,
      assignedTherapist,
      primary: blockRole === 'client_session' ? primaryService : null,
    })
  }
  mapped = await finishMeetLink(mapped, Boolean(payload.create_meet_link))
  if (blockRole === 'client_session' && clientId) await promoteWaitlistClient(clientId)
  return mapped
}

async function finishMeetLink(appointment: AppAppointment, requested: boolean): Promise<AppAppointment> {
  if (requested) return ensureMeetLink(appointment, true)
  const [withMeet] = await attachMeetUrls([appointment])
  if (withMeet.meet_url) rememberLocal(withMeet)
  return withMeet
}

function parseMinutesSafe(time: string | undefined): number {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

async function syncRemoteFollowOn(opts: {
  parent: AppAppointment
  ownerId: string
  clinicianId: string
  organizationId: string | null
  clientName: string
  assignedTherapist: string
  primary: ServiceRow | null
}) {
  const supabase = getSupabase()
  if (!supabase) return

  const { data: existing, error: listError } = await supabase
    .from('appointments')
    .select('id')
    .eq('parent_appointment_id', opts.parent.id)
  if (listError) throw listError

  const followOn = opts.primary?.follow_on_service_id
    ? await getServiceById(opts.primary.follow_on_service_id)
    : null
  const write = planFollowOnWrite(
    (existing || []).map((row) => row.id),
    planFollowOnBlock(opts.primary, followOn),
  )

  if (write.deleteIds.length) {
    const { error } = await supabase.from('appointments').delete().in('id', write.deleteIds)
    if (error) throw error
    forgetLocal(write.deleteIds)
  }

  if (!write.plan) return

  const startTime = opts.parent.end_time
  const endTime = addMinutesToTime(startTime, write.plan.durationMinutes)
  const sessionDate = opts.parent.session_date
  const extras: AppointmentExtras = {
    v: 0,
    client_name: opts.clientName,
    assigned_therapist: opts.assignedTherapist,
    therapy_modality: write.plan.therapyModality,
    service_name: write.plan.serviceName,
    location: opts.parent.location || '',
    notes: '',
    other_info: write.plan.serviceName,
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
  }
  const childRow = {
    owner_id: opts.ownerId,
    organization_id: opts.organizationId,
    client_id: opts.parent.client_id,
    clinician_id: opts.clinicianId,
    episode_id: opts.parent.episode_id,
    service_id: write.plan.serviceId,
    parent_appointment_id: opts.parent.id,
    appointment_type: 'one_to_one',
    starts_at: new Date(`${sessionDate}T${startTime}:00`).toISOString(),
    ends_at: new Date(`${sessionDate}T${endTime}:00`).toISOString(),
    attendance_status: null,
    encrypted_payload: extras as unknown as Json,
    block_role: write.plan.blockRole,
  }

  if (write.keepId) {
    const { data, error } = await supabase
      .from('appointments')
      .update(childRow)
      .eq('id', write.keepId)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw error
    rememberLocal(toAppAppointment(data))
    return
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert(childRow)
    .select(APPOINTMENT_COLUMNS)
    .single()
  if (error) throw error
  rememberLocal(toAppAppointment(data))
}

async function ensureMeetLink(appointment: AppAppointment, requested: boolean): Promise<AppAppointment> {
  if (!requested) return appointment
  if (appointment.parent_appointment_id) return appointment
  if (appointment.block_role && appointment.block_role !== 'client_session') return appointment
  if (!/^[0-9a-f-]{36}$/i.test(appointment.id)) return appointment

  const supabase = getSupabase()
  if (!supabase) return appointment

  const { data } = await supabase
    .from('appointment_external_links')
    .select('meet_url')
    .eq('appointment_id', appointment.id)
    .not('meet_url', 'is', null)
    .limit(1)
  const existing = data?.find((row) => row.meet_url)?.meet_url
  if (existing) {
    const next = { ...appointment, meet_url: existing }
    rememberLocal(next)
    return next
  }

  try {
    const meet = await createMeetForAppointment({
      appointmentId: appointment.id,
      startsAt: new Date(`${appointment.session_date}T${appointment.start_time}:00`).toISOString(),
      endsAt: new Date(`${appointment.session_date}T${appointment.end_time}:00`).toISOString(),
      summary: appointment.service_name || 'In the Room session',
    })
    if (!meet.meetUrl) return appointment
    const next = { ...appointment, meet_url: meet.meetUrl }
    rememberLocal(next)
    return next
  } catch (err) {
    console.error('Meet link was not created for appointment', appointment.id, err)
    return appointment
  }
}

/** Attach existing client appointments to an episode. Notes follow their appointment. */
export async function assignAppointmentsToEpisode(input: {
  clientId: string
  episodeId: string
  appointmentIds: string[]
}): Promise<string[]> {
  const requested = [...new Set(input.appointmentIds.map((id) => String(id)).filter(Boolean))]
  if (!input.clientId || !input.episodeId || !requested.length) {
    throw new Error('Choose an episode and at least one appointment.')
  }
  if (!isSupabaseConfigured()) {
    const moved = assignAppointmentsToEpisodeLocal(input.clientId, input.episodeId, requested)
    if (!moved.length) throw new Error('Choose appointments for this client.')
    return moved
  }

  const supabase = getSupabase()
  if (!supabase) {
    const moved = assignAppointmentsToEpisodeLocal(input.clientId, input.episodeId, requested)
    if (!moved.length) throw new Error('Choose appointments for this client.')
    return moved
  }

  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('id, client_id')
    .eq('id', input.episodeId)
    .maybeSingle()
  if (episodeError) throw episodeError
  if (!episode || episode.client_id !== input.clientId) {
    throw new Error('That episode is not on this client.')
  }

  const ids = requested.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) throw new Error('Choose appointments for this client.')

  const { data: rows, error: listError } = await supabase
    .from('appointments')
    .select('id, client_id, parent_appointment_id')
    .in('id', ids)
  if (listError) throw listError
  const parents = (rows || [])
    .filter((row) => row.client_id === input.clientId && !row.parent_appointment_id)
    .map((row) => row.id)
  if (!parents.length) throw new Error('Choose appointments for this client.')

  const { error: updateError } = await supabase
    .from('appointments')
    .update({ episode_id: input.episodeId })
    .in('id', parents)
  if (updateError) throw updateError

  const { error: childError } = await supabase
    .from('appointments')
    .update({ episode_id: input.episodeId })
    .in('parent_appointment_id', parents)
  if (childError) throw childError

  const { data: notes, error: notesError } = await supabase
    .from('progress_notes')
    .select('id, note_number, episode_id')
    .in('appointment_id', parents)
  if (notesError) throw notesError

  const moving = (notes || []).filter((note) => note.episode_id !== input.episodeId)
  if (moving.length) {
    const { data: taken, error: takenError } = await supabase
      .from('progress_notes')
      .select('note_number')
      .eq('episode_id', input.episodeId)
    if (takenError) throw takenError
    const used = new Set((taken || []).map((row) => Number(row.note_number) || 0))
    let nextNumber = used.size ? Math.max(...used) + 1 : 1
    for (const note of moving) {
      let noteNumber = Number(note.note_number) || nextNumber
      if (used.has(noteNumber)) {
        while (used.has(nextNumber)) nextNumber += 1
        noteNumber = nextNumber
        nextNumber += 1
      }
      used.add(noteNumber)
      const { error } = await supabase
        .from('progress_notes')
        .update({ episode_id: input.episodeId, note_number: noteNumber })
        .eq('id', note.id)
      if (error) throw error
    }
  }

  assignAppointmentsToEpisodeLocal(input.clientId, input.episodeId, parents)
  return parents
}

/** Save the appointments that belong on this episode. Unticked ones leave the course. */
export async function setEpisodeAppointments(input: {
  clientId: string
  episodeId: string
  appointmentIds: string[]
}): Promise<{ added: string[]; removed: string[] }> {
  const requested = [...new Set(input.appointmentIds.map((id) => String(id)).filter(Boolean))]
  if (!input.clientId || !input.episodeId) {
    throw new Error('Choose an episode first.')
  }
  if (!isSupabaseConfigured()) {
    return setEpisodeAppointmentsLocal(input.clientId, input.episodeId, requested)
  }
  const supabase = getSupabase()
  if (!supabase) return setEpisodeAppointmentsLocal(input.clientId, input.episodeId, requested)

  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('id, client_id')
    .eq('id', input.episodeId)
    .maybeSingle()
  if (episodeError) throw episodeError
  if (!episode || episode.client_id !== input.clientId) {
    throw new Error('That episode is not on this client.')
  }

  const { data: rows, error: listError } = await supabase
    .from('appointments')
    .select('id, episode_id, parent_appointment_id')
    .eq('client_id', input.clientId)
    .is('parent_appointment_id', null)
  if (listError) throw listError
  const known = new Set((rows || []).map((row) => row.id))
  const desired = requested.filter((id) => known.has(id))
  const current = (rows || []).filter((row) => row.episode_id === input.episodeId).map((row) => row.id)
  const removed = current.filter((id) => !desired.includes(id))
  const toAdd = desired.filter((id) => !current.includes(id))

  if (removed.length) {
    const { error } = await supabase.from('appointments').update({ episode_id: null }).in('id', removed)
    if (error) throw error
    const { error: childError } = await supabase
      .from('appointments')
      .update({ episode_id: null })
      .in('parent_appointment_id', removed)
    if (childError) throw childError
  }
  if (toAdd.length) {
    await assignAppointmentsToEpisode({
      clientId: input.clientId,
      episodeId: input.episodeId,
      appointmentIds: toAdd,
    })
  }
  setEpisodeAppointmentsLocal(input.clientId, input.episodeId, desired)
  return { added: toAdd, removed }
}

export async function saveAppointmentForUser(
  payload: Record<string, unknown>,
  userId: string,
): Promise<AppAppointment> {
  assertWritableAppointment(payload)
  if (!isSupabaseConfigured()) {
    return saveLocalAppointment(payload, userId) as AppAppointment
  }
  return upsertAppointmentRemote(payload, userId)
}

/** Delete primary appointments by id (follow-on children cascade via FK). */
export async function deleteAppointmentsByIds(ids: string[]): Promise<number> {
  const requested = [...new Set(ids.map((id) => String(id)).filter(Boolean))]
  if (requested.length && requested.every((id) => id.startsWith('ext-'))) {
    throw new Error('Google busy time is read-only and is not stored as an appointment.')
  }
  const unique = requested.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!unique.length) return 0

  const purgeLocal = (ids: string[]) => {
    const remove = new Set(ids)
    for (const row of [...db.appointments]) {
      const parentId = String((row as { parent_appointment_id?: string }).parent_appointment_id || '')
      if (remove.has(String(row.id)) || remove.has(parentId)) remove.add(String(row.id))
    }
    const kept = db.appointments.filter((a) => !remove.has(String(a.id)))
    db.appointments.length = 0
    for (const row of kept) db.appointments.push(row)
    return remove.size
  }

  if (!isSupabaseConfigured()) {
    const before = db.appointments.length
    purgeLocal(unique)
    return before - db.appointments.length
  }

  const withChildren = new Set(unique)
  for (const row of db.appointments) {
    const parentId = String((row as { parent_appointment_id?: string }).parent_appointment_id || '')
    if (withChildren.has(parentId)) withChildren.add(String(row.id))
  }

  // Remove linked Google Calendar events before the DB rows (and their link cascade) go away.
  try {
    const googleIds = [...withChildren].filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    await deleteGoogleEventsForAppointments(googleIds)
  } catch {
    // Best-effort — the appointment delete must still succeed.
  }

  const supabase = getSupabase()
  if (!supabase) return 0
  const { error, count } = await supabase
    .from('appointments')
    .delete({ count: 'exact' })
    .in('id', unique)
  if (error) throw error

  purgeLocal(unique)
  return count ?? unique.length
}

/**
 * Apply schedule/service fields from `payload` onto many primary appointments,
 * keeping each row's own session_date (except the anchor id, which can move).
 */
export async function updateAppointmentsInScope(
  ids: string[],
  payload: Record<string, unknown>,
  userId: string,
  anchorId: string,
): Promise<AppAppointment | null> {
  let last: AppAppointment | null = null
  for (const id of ids) {
    const existing = db.appointments.find((a) => a.id === id) as AppAppointment | undefined
    const sessionDate = id === anchorId
      ? String(payload.session_date || existing?.session_date || '')
      : String(existing?.session_date || payload.session_date || '')
    last = await saveAppointmentForUser({
      ...payload,
      id,
      session_date: sessionDate,
      dates: undefined,
    }, userId)
  }
  return last
}
