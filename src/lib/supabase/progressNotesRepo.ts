import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { db } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { parseOrThrow, progressNoteInputSchema } from '../schemas'
import {
  enrichProgressNoteLock,
  isProgressNoteEditable,
  lockUntilFromSignOff,
} from '../progressNoteLifecycle'
import {
  getProgressNote,
  getProgressNoteByAppointment,
  getProgressNotes,
  saveProgressNote,
  signOffProgressNote,
} from '../store/clinicalDocs'
import { getAppointment } from '../store/scheduling'
import { episodeForNote } from '../scheduling/episodes'
import { findActiveEpisode, openEpisode } from './episodesRepo'
import { activeLocalEpisode, getLocalEpisode } from '../store/episodes'

const NOTE_COLUMNS = 'id, owner_id, organization_id, client_id, episode_id, appointment_id, author_id, note_number, session_date, noted_at, status, signed_off_at, lock_until, template_id, encrypted_payload, created_at, updated_at'

type NotePayload = {
  v: 0
  title: string
  content: string
  modality_used: string | null
  therapeutic_theme: string
  artwork_attachments: unknown[]
}

type NoteRow = {
  id: string
  owner_id: string
  organization_id: string | null
  client_id: string
  episode_id: string
  appointment_id: string | null
  author_id: string
  note_number: number
  session_date: string
  noted_at: string
  status: string
  signed_off_at: string | null
  lock_until: string | null
  encrypted_payload: Json
  created_at: string
  updated_at: string
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseNotePayload(raw: Json | null | undefined): NotePayload {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return {
    v: 0,
    title: String(row.title || 'Untitled Process Note'),
    content: String(row.content || '<p></p>'),
    modality_used: row.modality_used ? String(row.modality_used) : null,
    therapeutic_theme: String(row.therapeutic_theme || ''),
    artwork_attachments: Array.isArray(row.artwork_attachments) ? row.artwork_attachments : [],
  }
}

function toAppNote(row: NoteRow) {
  const payload = parseNotePayload(row.encrypted_payload)
  return enrichProgressNoteLock({
    id: row.id,
    client_id: row.client_id,
    author_id: row.author_id,
    appointment_id: row.appointment_id,
    episode_id: row.episode_id,
    note_number: row.note_number,
    title: payload.title,
    content: payload.content,
    session_date: row.session_date,
    modality_used: payload.modality_used,
    therapeutic_theme: payload.therapeutic_theme,
    artwork_attachments: payload.artwork_attachments,
    status: row.status === 'signed_off' ? 'signed_off' : 'draft',
    signed_off_at: row.signed_off_at,
    lock_until: row.lock_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

function remember(note: ReturnType<typeof toAppNote>) {
  const idx = db.progressNotes.findIndex((row) => row.id === note.id)
  if (idx === -1) db.progressNotes.push(note as unknown as StoreRecord)
  else db.progressNotes[idx] = { ...db.progressNotes[idx], ...note } as StoreRecord
  return enrichProgressNoteLock(db.progressNotes[idx === -1 ? db.progressNotes.length - 1 : idx] as Record<string, unknown>)
}

async function organizationFor(clientId: string, episodeId: string | null): Promise<string | null> {
  const episode = episodeId ? getLocalEpisode(episodeId) : null
  if (episode?.organization_id) return episode.organization_id
  const client = db.clients.find((row) => row.id === clientId) as { workplace_id?: string | null } | undefined
  return client?.workplace_id || null
}

async function resolveEpisodeId(payload: {
  client_id?: string
  episode_id?: string | null
  appointment_id?: string | null
}, userId: string): Promise<string> {
  const clientId = String(payload.client_id || '')
  if (!clientId) throw new Error('A client is required to create a Process Note.')
  const appointment = payload.appointment_id ? getAppointment(payload.appointment_id) : null
  const active = isSupabaseConfigured()
    ? await findActiveEpisode(clientId)
    : activeLocalEpisode(clientId)
  const decision = episodeForNote({
    requestedEpisodeId: asId(payload.episode_id),
    appointmentEpisodeId: asId(appointment?.episode_id),
    activeEpisodeId: active?.id ?? null,
  })
  if (!decision.open && decision.episodeId) return decision.episodeId
  const opened = await openEpisode({
    clientId,
    ownerId: userId,
    organizationId: await organizationFor(clientId, null),
  })
  return opened.id
}

export async function fetchProgressNotesForClient(clientId: string) {
  if (!clientId || !isSupabaseConfigured()) return getProgressNotes(clientId)
  const supabase = getSupabase()
  if (!supabase) return getProgressNotes(clientId)
  const { data, error } = await supabase
    .from('progress_notes')
    .select(NOTE_COLUMNS)
    .eq('client_id', clientId)
    .order('session_date', { ascending: false })
  if (error) throw error
  for (const row of data || []) remember(toAppNote(row as NoteRow))
  return getProgressNotes(clientId)
}

export async function fetchProgressNote(noteId: string) {
  if (!noteId) return null
  if (!isSupabaseConfigured() || !isUuid(noteId)) return getProgressNote(noteId)
  const supabase = getSupabase()
  if (!supabase) return getProgressNote(noteId)
  const { data, error } = await supabase
    .from('progress_notes')
    .select(NOTE_COLUMNS)
    .eq('id', noteId)
    .maybeSingle()
  if (error) throw error
  if (!data) return getProgressNote(noteId)
  return remember(toAppNote(data as NoteRow))
}

export async function fetchProgressNoteByAppointment(appointmentId: string) {
  if (!appointmentId) return null
  if (!isSupabaseConfigured() || !isUuid(appointmentId)) return getProgressNoteByAppointment(appointmentId)
  const supabase = getSupabase()
  if (!supabase) return getProgressNoteByAppointment(appointmentId)
  const { data, error } = await supabase
    .from('progress_notes')
    .select(NOTE_COLUMNS)
    .eq('appointment_id', appointmentId)
    .order('note_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return getProgressNoteByAppointment(appointmentId)
  return remember(toAppNote(data as NoteRow))
}

async function nextNoteNumber(episodeId: string): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 1
  const { data, error } = await supabase
    .from('progress_notes')
    .select('note_number')
    .eq('episode_id', episodeId)
  if (error) throw error
  return (data || []).reduce((max, row) => Math.max(max, Number(row.note_number) || 0), 0) + 1
}

export async function saveProgressNoteForUser(payload: Record<string, unknown>, userId: string) {
  const parsed = parseOrThrow(progressNoteInputSchema, payload, 'Process Note') as Record<string, unknown>
  if (!isSupabaseConfigured()) {
    const existing = parsed.id ? getProgressNote(String(parsed.id)) : null
    const episodeId = asId(parsed.episode_id)
      || asId(existing?.episode_id)
      || (parsed.client_id
        ? await resolveEpisodeId({
          client_id: String(parsed.client_id),
          episode_id: null,
          appointment_id: (parsed.appointment_id as string | null | undefined) ?? null,
        }, userId)
        : null)
    return saveProgressNote({ ...parsed, episode_id: episodeId }, userId)
  }

  const supabase = getSupabase()
  if (!supabase) return saveProgressNote(parsed, userId)

  const existingId = isUuid(parsed.id) ? String(parsed.id) : null
  const current = existingId ? await fetchProgressNote(existingId) : null
  if (current && !isProgressNoteEditable(current)) {
    throw new Error('This note is locked after the 48-hour amendment period.')
  }

  const clientId = String(parsed.client_id || current?.client_id || '')
  const episodeId = await resolveEpisodeId({
    client_id: clientId,
    episode_id: asId(parsed.episode_id) || asId(current?.episode_id),
    appointment_id: asId(parsed.appointment_id) ?? asId(current?.appointment_id),
  }, userId)
  const today = new Date().toISOString().slice(0, 10)
  const extras: NotePayload = {
    v: 0,
    title: String(parsed.title || 'Untitled Process Note'),
    content: String(parsed.content || '<p></p>'),
    modality_used: parsed.modality_used ? String(parsed.modality_used) : null,
    therapeutic_theme: String(parsed.therapeutic_theme || ''),
    artwork_attachments: Array.isArray(parsed.artwork_attachments) ? parsed.artwork_attachments : [],
  }
  const appointmentId = isUuid(parsed.appointment_id) ? String(parsed.appointment_id) : null
  const shared = {
    client_id: clientId,
    episode_id: episodeId,
    appointment_id: appointmentId,
    session_date: String(parsed.session_date || today),
    encrypted_payload: extras as unknown as Json,
    organization_id: await organizationFor(clientId, episodeId),
  }

  if (existingId) {
    const { data, error } = await supabase
      .from('progress_notes')
      .update(shared)
      .eq('id', existingId)
      .select(NOTE_COLUMNS)
      .single()
    if (error) throw error
    return remember(toAppNote(data as NoteRow))
  }

  const { data, error } = await supabase
    .from('progress_notes')
    .insert({
      ...shared,
      owner_id: userId,
      author_id: userId,
      note_number: await nextNoteNumber(episodeId),
      noted_at: new Date().toISOString(),
      status: 'draft',
    })
    .select(NOTE_COLUMNS)
    .single()
  if (error) throw error
  return remember(toAppNote(data as NoteRow))
}

export async function signOffProgressNoteForUser(payload: Record<string, unknown>, userId: string) {
  const saved = await saveProgressNoteForUser(payload, userId)
  if (!isSupabaseConfigured()) {
    return signOffProgressNote({ ...payload, id: saved.id, episode_id: saved.episode_id }, userId)
  }
  const supabase = getSupabase()
  if (!supabase || !isUuid(saved.id)) return signOffProgressNote({ ...payload, id: saved.id }, userId)
  const now = new Date()
  const { data, error } = await supabase
    .from('progress_notes')
    .update({
      status: 'signed_off',
      signed_off_at: now.toISOString(),
      lock_until: lockUntilFromSignOff(now),
    })
    .eq('id', String(saved.id))
    .select(NOTE_COLUMNS)
    .single()
  if (error) throw error
  return remember(toAppNote(data as NoteRow))
}
