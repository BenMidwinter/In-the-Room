import { db, uid } from '../data/collections'
import { getOrgServiceForModality } from './organisation'
import type { StoreRecord } from '../types/collections'
import { canAccessClient, filterClientsForUser, type Client } from '../permissions'
import { sortLatestFirst } from '../dateArchitecture'
import { parseOrThrow, clientInputSchema, clientClinicalDetailsSchema, clinicalProfileInputSchema } from '../schemas'

export function getClientsForUser(userId, myWorkplace) {
  return filterClientsForUser(db.clients as Client[], userId, myWorkplace)
}

export function getClientById(clientId, userId, _myWorkplace = null) {
  const client = db.clients.find(c => c.id === clientId)
  return canAccessClient(client as Client | null, userId) ? client : null
}

export function upsertClient(payload, userId) {
  payload = parseOrThrow(clientInputSchema, payload, 'Client')
  const realName = `${payload.first_name.trim()} ${payload.surname.trim()}`
  const workplace = payload.workplace_id
    ? db.workplaces.find(w => w.id === payload.workplace_id)
    : null

  const record = {
    first_name: payload.first_name.trim(),
    surname: payload.surname.trim(),
    real_name: realName,
    dob: payload.dob,
    school: payload.school?.trim() || '',
    diagnosis: payload.diagnosis || '',
    medication: payload.medication?.trim() || '',
    gender: payload.gender?.trim() || '',
    email: payload.email?.trim() || '',
    on_screener: false,
    on_waitlist: false,
    status: 'active',
    workplace_id: payload.workplace_id || null,
    workplace_name: workplace?.name || 'Private Practice',
    user_id: userId,
    is_active: true,
  }

  if (payload.id) {
    const idx = db.clients.findIndex(c => c.id === payload.id)
    if (idx === -1) throw new Error('Client not found')
    db.clients[idx] = { ...db.clients[idx], ...record }
    return db.clients[idx]
  }

  const created = {
    id: uid('client'),
    ...record,
    created_at: new Date().toISOString(),
  }
  db.clients.push(created as StoreRecord)
  return created
}

export function updateClientClinicalDetails(clientId, details) {
  const { diagnosis, medication, school, gender } = parseOrThrow(
    clientClinicalDetailsSchema,
    details,
    'Clinical details',
  )
  const idx = db.clients.findIndex(c => c.id === clientId)
  if (idx === -1) throw new Error('Client not found')
  db.clients[idx] = {
    ...db.clients[idx],
    ...(school !== undefined ? { school } : {}),
    ...(medication !== undefined ? { medication } : {}),
    ...(diagnosis !== undefined ? { diagnosis } : {}),
    ...(gender !== undefined ? { gender } : {}),
  }
  return { ...db.clients[idx] }
}

export function updateClientClinicalProfile(clientId, clinicalProfile) {
  const parsed = parseOrThrow(clinicalProfileInputSchema, clinicalProfile, 'Clinical profile')
  const idx = db.clients.findIndex(c => c.id === clientId)
  if (idx === -1) throw new Error('Client not found')
  db.clients[idx] = {
    ...db.clients[idx],
    clinical_profile: {
      ...((db.clients[idx].clinical_profile as Record<string, string>) || {}),
      ...parsed,
    },
  } as StoreRecord
  return { ...db.clients[idx] }
}

export function getClientRecord(clientId) {
  const client = db.clients.find(c => c.id === clientId)
  return client ? { ...client, clinical_profile: { ...(client.clinical_profile || {}) } } : null
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Client overview timeline — sessions, notes, documents, letters, and activity.
 * Pass `appointments` when the Supabase query has loaded so live bookings appear.
 * Pass `activity` for remote letters / reports / form submissions.
 */
export function getClientTimeline(
  clientId,
  {
    appointments,
    activity,
  }: {
    appointments?: StoreRecord[]
    activity?: StoreRecord[]
  } = {},
) {
  const events = db.timelineEvents.filter(e => e.client_id === clientId)
  const noteEvents = db.progressNotes
    .filter(n => n.client_id === clientId)
    .map(n => ({
      id: `timeline-note-${n.id}`,
      client_id: clientId,
      type: 'note',
      title: n.title,
      summary: stripHtml(n.content).slice(0, 120) + (stripHtml(n.content).length > 120 ? '…' : ''),
      created_at: n.created_at,
      author_id: n.author_id,
      ref_id: n.id,
    }))
  const docEvents = db.workingDocuments
    .filter(d => d.client_id === clientId)
    .map(d => ({
      id: `timeline-doc-${d.id}`,
      client_id: clientId,
      type: 'document',
      title: d.title,
      summary: 'Working document updated',
      created_at: d.updated_at,
      author_id: d.author_id,
      ref_id: d.id,
    }))

  const letterEvents = db.letters
    .filter((l) => l.client_id === clientId)
    .map((l) => ({
      id: `timeline-letter-local-${l.id}`,
      client_id: clientId,
      type: 'letter',
      title: l.title || 'Letter created',
      summary: [l.letter_date, l.recipient ? `To ${l.recipient}` : 'Letter created']
        .filter(Boolean)
        .join(' · '),
      created_at: l.letter_date
        ? `${l.letter_date}T12:00:00`
        : (l.updated_at || l.created_at),
      author_id: l.author_id,
      ref_id: l.id,
    }))

  const apptSource = Array.isArray(appointments)
    ? appointments.filter((a) => !a.client_id || a.client_id === clientId)
    : db.appointments.filter((a) => a.client_id === clientId)

  const sessionEvents = apptSource
    .filter((a) => {
      if (a.attendance_status === 'cancelled') return false
      if (!a.client_id) return false
      const role = a.block_role
      // Everything created for the client except pure busy blocks.
      return role !== 'busy'
    })
    .map((a) => {
      const sessionDate = a.session_date || String(a.scheduled_at || '').slice(0, 10)
      const startTime = a.start_time || String(a.scheduled_at || '').slice(11, 16)
      const role = a.block_role
      const isSupport = role === 'support' || role === 'admin'
      const catalogName = getOrgServiceForModality(a.service_id || a.therapy_modality)?.name
      const title = a.service_name
        || catalogName
        || (a.therapy_modality && a.therapy_modality !== 't' && String(a.therapy_modality).length > 2
          ? String(a.therapy_modality).replace(/_/g, ' ')
          : null)
        || (isSupport ? (role === 'admin' ? 'Admin time' : 'Support activity') : 'Session')
      const when = [sessionDate, startTime].filter(Boolean).join(' · ')
      return {
        id: `timeline-appt-${a.id}`,
        client_id: clientId,
        type: isSupport ? 'support' : 'session',
        title,
        summary: [when, a.location, isSupport ? (role === 'admin' ? 'Admin' : 'Support') : null]
          .filter(Boolean)
          .join(' · '),
        created_at: sessionDate
          ? `${sessionDate}T${startTime || '00:00'}:00`
          : (a.created_at || a.starts_at || new Date().toISOString()),
        author_id: a.clinician_id,
        ref_id: a.id,
      }
    })

  const activityEvents = Array.isArray(activity) ? activity : []

  return [
    ...events,
    ...noteEvents,
    ...docEvents,
    ...letterEvents,
    ...sessionEvents,
    ...activityEvents,
  ].sort(
    (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  )
}

export function getEpisodes(clientId) {
  return sortLatestFirst(
    db.episodes.filter(e => e.client_id === clientId),
    'start_date',
  )
}
