import { db, uid } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { canAccessClient, filterClientsForUser, type Client } from '../permissions'
import { sortLatestFirst } from '../dateArchitecture'
import { parseOrThrow, clientInputSchema, clientClinicalDetailsSchema, clinicalProfileInputSchema } from '../schemas'

export function getOrganisationClients() {
  return [...db.clients]
}

export function getClientsForUser(userId, myWorkplace) {
  return filterClientsForUser(db.clients as Client[], userId, myWorkplace)
}

export function getClientById(clientId, userId, myWorkplace) {
  const client = db.clients.find(c => c.id === clientId)
  return canAccessClient(client as Client | null, userId, myWorkplace) ? client : null
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
  const { diagnosis, medication, school } = parseOrThrow(
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

export function getBodyMap(clientId) {
  return db.bodyMaps[clientId] || null
}

export function saveBodyMap(clientId, { nodes, edges }) {
  const existing = db.bodyMaps[clientId]
  db.bodyMaps[clientId] = {
    snapshotId: existing?.snapshotId || uid('snap'),
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    id: clientId,
  } as StoreRecord
  return db.bodyMaps[clientId]
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function getClientTimeline(clientId) {
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

  return [...events, ...noteEvents, ...docEvents].sort(
    (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  )
}

export function getEpisodes(clientId) {
  return sortLatestFirst(
    db.episodes.filter(e => e.client_id === clientId),
    'start_date',
  )
}
