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
} from '../store/scheduling'
import { addMinutesToTime, todayYmd } from '../dateArchitecture'
import { appointmentSchedule, fromDatetimeLocalValue, type AppointmentLike } from '../appointmentUtils'
import { parseOrThrow, appointmentInputSchema } from '../schemas'
import { sortAppointmentsLatestFirst } from '../calendarAccess'
import { getClientsForUser } from '../store/clientRecords'
import { getServiceById } from './servicesRepo'

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
  const mapped = (data || []).map((row) => toAppAppointment(row))
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
  return data ? toAppAppointment(data) : null
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

export async function upsertAppointmentRemote(
  payload: Record<string, unknown>,
  userId: string,
): Promise<AppAppointment> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  payload = parseOrThrow(appointmentInputSchema, payload, 'Appointment') as Record<string, unknown>
  const schedule = payload.session_date
    ? { session_date: String(payload.session_date), start_time: String(payload.start_time || '09:00') }
    : fromDatetimeLocalValue(String(payload.scheduled_at || ''))

  const durationMinutes = Number(payload.duration_minutes ?? 60)
  const client = db.clients.find((c) => c.id === payload.client_id) as
    | { real_name?: string; first_name?: string; surname?: string; workplace_id?: string | null }
    | undefined
  const clinicianId = String(payload.clinician_id || userId)
  const startTime = String(schedule.start_time || '09:00')
  const endTime = payload.end_time
    ? String(payload.end_time)
    : addMinutesToTime(startTime, durationMinutes)
  const sessionDate = String(schedule.session_date)
  const startsAt = new Date(`${sessionDate}T${startTime}:00`).toISOString()
  const endsAt = new Date(`${sessionDate}T${endTime}:00`).toISOString()

  const clientName = String(
    client?.real_name
    || `${client?.first_name || ''} ${client?.surname || ''}`.trim()
    || 'Client',
  )
  const assignedTherapist = await resolveClinicianDisplayName(supabase, clinicianId)

  const serviceId = payload.service_id && /^[0-9a-f-]{36}$/i.test(String(payload.service_id))
    ? String(payload.service_id)
    : null

  let serviceName = String(payload.service_name || '').trim()
  let therapyModality = String(payload.therapy_modality || 'music_therapy')
  if (serviceId) {
    try {
      const primary = await getServiceById(serviceId)
      if (primary) {
        serviceName = primary.name
        therapyModality = primary.slug || therapyModality
      }
    } catch {
      /* keep payload modality */
    }
  }

  const extras: AppointmentExtras = {
    v: 0,
    client_name: clientName,
    assigned_therapist: assignedTherapist,
    therapy_modality: therapyModality,
    service_name: serviceName || undefined,
    location: String(payload.location ?? ''),
    notes: String(payload.notes ?? ''),
    other_info: String((payload.other_info as string | undefined)?.trim?.() || payload.other_info || ''),
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
  }

  const selectCols = 'id, client_id, clinician_id, episode_id, service_id, appointment_type, attendance_status, starts_at, ends_at, block_role, parent_appointment_id, series_id, encrypted_payload, created_at, updated_at'

  const seriesId = payload.series_id && /^[0-9a-f-]{36}$/i.test(String(payload.series_id))
    ? String(payload.series_id)
    : undefined

  const row = {
    owner_id: userId,
    organization_id: client?.workplace_id || null,
    client_id: payload.client_id ? String(payload.client_id) : null,
    clinician_id: clinicianId,
    episode_id: payload.episode_id ? String(payload.episode_id) : null,
    service_id: serviceId,
    appointment_type: String(payload.appointment_type || 'one_to_one'),
    starts_at: startsAt,
    ends_at: endsAt,
    attendance_status: (payload.attendance_status as string | null | undefined) ?? null,
    encrypted_payload: extras as unknown as Json,
    block_role: 'client_session' as const,
    ...(seriesId ? { series_id: seriesId } : {}),
  }

  if (payload.id && /^[0-9a-f-]{36}$/i.test(String(payload.id))) {
    const { data, error } = await supabase
      .from('appointments')
      .update(row)
      .eq('id', String(payload.id))
      .select(selectCols)
      .single()
    if (error) throw error
    const mapped = toAppAppointment(data)
    const idx = db.appointments.findIndex((a) => a.id === mapped.id)
    if (idx === -1) db.appointments.push(mapped as unknown as StoreRecord)
    else db.appointments[idx] = mapped as unknown as StoreRecord
    return mapped
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert(row)
    .select(selectCols)
    .single()
  if (error) throw error
  const mapped = toAppAppointment(data)
  db.appointments.push(mapped as unknown as StoreRecord)

  // Auto-create linked follow-on support/admin block from service settings.
  if (serviceId && row.block_role === 'client_session') {
    try {
      await createFollowOnBlock({
        parent: mapped,
        parentRow: data,
        ownerId: userId,
        clinicianId,
        organizationId: row.organization_id,
        clientName,
        assignedTherapist,
      })
    } catch (err) {
      console.error('Failed to create follow-on block for appointment', mapped.id, err)
    }
  }

  return mapped
}

async function createFollowOnBlock(opts: {
  parent: AppAppointment
  parentRow: { id: string; service_id?: string | null }
  ownerId: string
  clinicianId: string
  organizationId: string | null
  clientName: string
  assignedTherapist: string
}) {
  const supabase = getSupabase()
  if (!supabase || !opts.parentRow.service_id) return

  const primary = await getServiceById(opts.parentRow.service_id)
  if (!primary?.follow_on_service_id) return

  const followOn = await getServiceById(primary.follow_on_service_id)
  if (!followOn || followOn.is_active === false) return

  const duration = Number(
    primary.follow_on_duration_minutes
    || followOn.default_duration_minutes
    || 10,
  )
  if (!Number.isFinite(duration) || duration <= 0) return

  const startTime = opts.parent.end_time
  const endTime = addMinutesToTime(startTime, duration)
  const sessionDate = opts.parent.session_date
  const startsAt = new Date(`${sessionDate}T${startTime}:00`).toISOString()
  const endsAt = new Date(`${sessionDate}T${endTime}:00`).toISOString()

  const blockRole = followOn.service_type === 'admin'
    ? 'admin'
    : followOn.service_type === 'busy'
      ? 'busy'
      : 'support'

  const extras: AppointmentExtras = {
    v: 0,
    client_name: opts.clientName,
    assigned_therapist: opts.assignedTherapist,
    therapy_modality: followOn.slug,
    service_name: followOn.name,
    location: opts.parent.location || '',
    notes: '',
    other_info: followOn.name,
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      owner_id: opts.ownerId,
      organization_id: opts.organizationId,
      client_id: opts.parent.client_id,
      clinician_id: opts.clinicianId,
      episode_id: opts.parent.episode_id,
      service_id: followOn.id,
      parent_appointment_id: opts.parent.id,
      appointment_type: 'one_to_one',
      starts_at: startsAt,
      ends_at: endsAt,
      attendance_status: null,
      encrypted_payload: extras as unknown as Json,
      block_role: blockRole,
    })
    .select('id, client_id, clinician_id, episode_id, service_id, appointment_type, attendance_status, starts_at, ends_at, block_role, parent_appointment_id, series_id, encrypted_payload, created_at, updated_at')
    .single()

  if (error) throw error
  const mapped = toAppAppointment(data)
  db.appointments.push(mapped as unknown as StoreRecord)
}

export async function saveAppointmentForUser(
  payload: Record<string, unknown>,
  userId: string,
): Promise<AppAppointment> {
  if (!isSupabaseConfigured()) {
    return saveLocalAppointment(payload, userId) as AppAppointment
  }
  return upsertAppointmentRemote(payload, userId)
}

/** Delete primary appointments by id (follow-on children cascade via FK). */
export async function deleteAppointmentsByIds(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))]
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
