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
  appendProgressNoteAddendum,
  getProgressNote,
  getProgressNoteByAppointment,
  getProgressNotes,
  saveProgressNote,
  signOffProgressNote,
} from '../store/clinicalDocs'
import { getAppointment } from '../store/scheduling'
import { getLocalEpisode } from '../store/episodes'

const NOTE_NEEDS_APPOINTMENT = 'A Process Note is saved against an appointment.'
const NOTE_NEEDS_EPISODE = 'Add this appointment to an episode before saving the Process Note.'

const NOTE_COLUMNS = 'id, owner_id, organization_id, client_id, episode_id, appointment_id, author_id, note_number, session_date, noted_at, status, signed_off_at, lock_until, template_id, encrypted_payload, created_at, updated_at'

type NoteAddendum = {
  id: string
  body: string
  created_at: string
}

type NotePayload = {
  v: 0
  title: string
  content: string
  modality_used: string | null
  therapeutic_theme: string
  artwork_attachments: unknown[]
  template_id: string | null
  addendums: NoteAddendum[]
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
  template_id: string | null
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

function parseAddendums(raw: unknown): NoteAddendum[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = asId(row.id)
    const body = String(row.body || '')
    if (!id || !body.trim()) return []
    return [{
      id,
      body,
      created_at: String(row.created_at || ''),
    }]
  })
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
    template_id: asId(row.template_id),
    addendums: parseAddendums(row.addendums),
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
    template_id: payload.template_id || row.template_id || null,
    addendums: payload.addendums,
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

async function episodeIdFromAppointment(appointmentId: string | null): Promise<string> {
  if (!appointmentId) throw new Error(NOTE_NEEDS_APPOINTMENT)
  let episodeId = asId(getAppointment(appointmentId)?.episode_id)
  if (!episodeId && isSupabaseConfigured() && isUuid(appointmentId)) {
    const supabase = getSupabase()
    if (supabase) {
      const { data, error } = await supabase
        .from('appointments')
        .select('episode_id')
        .eq('id', appointmentId)
        .maybeSingle()
      if (error) throw error
      episodeId = asId(data?.episode_id)
    }
  }
  if (!episodeId) throw new Error(NOTE_NEEDS_EPISODE)
  return episodeId
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
  const existingLocal = parsed.id ? getProgressNote(String(parsed.id)) : null
  const appointmentId = asId(parsed.appointment_id) || asId(existingLocal?.appointment_id)
  const episodeId = await episodeIdFromAppointment(appointmentId)
  const filed = { ...parsed, appointment_id: appointmentId, episode_id: episodeId }
  if (!isSupabaseConfigured()) return saveProgressNote(filed, userId)

  const supabase = getSupabase()
  if (!supabase) return saveProgressNote(filed, userId)

  const existingId = isUuid(parsed.id) ? String(parsed.id) : null
  const current = existingId ? await fetchProgressNote(existingId) : null
  if (current && !isProgressNoteEditable(current)) {
    throw new Error('This note is locked after the 48-hour amendment period.')
  }

  const clientId = String(parsed.client_id || current?.client_id || '')
  const remoteAppointmentId = asId(parsed.appointment_id) || asId(current?.appointment_id) || appointmentId
  const remoteEpisodeId = await episodeIdFromAppointment(remoteAppointmentId)
  const today = new Date().toISOString().slice(0, 10)
  const extras: NotePayload = {
    v: 0,
    title: String(parsed.title || 'Untitled Process Note'),
    content: String(parsed.content || '<p></p>'),
    modality_used: parsed.modality_used ? String(parsed.modality_used) : null,
    therapeutic_theme: String(parsed.therapeutic_theme || ''),
    artwork_attachments: Array.isArray(parsed.artwork_attachments) ? parsed.artwork_attachments : [],
    template_id: asId(parsed.template_id),
    addendums: Array.isArray((current as { addendums?: NoteAddendum[] } | null)?.addendums)
      ? (current as { addendums: NoteAddendum[] }).addendums
      : [],
  }
  const shared = {
    client_id: clientId,
    episode_id: remoteEpisodeId,
    appointment_id: isUuid(remoteAppointmentId) ? remoteAppointmentId : null,
    session_date: String(parsed.session_date || today),
    template_id: isUuid(parsed.template_id) ? String(parsed.template_id) : null,
    encrypted_payload: extras as unknown as Json,
    organization_id: await organizationFor(clientId, remoteEpisodeId),
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
      note_number: await nextNoteNumber(remoteEpisodeId),
      noted_at: new Date().toISOString(),
      status: 'draft',
    })
    .select(NOTE_COLUMNS)
    .single()
  if (error) throw error
  return remember(toAppNote(data as NoteRow))
}

export async function appendProgressNoteAddendumForUser(noteId: string, body: string) {
  if (!isSupabaseConfigured() || !isUuid(noteId)) return appendProgressNoteAddendum(noteId, body)
  const supabase = getSupabase()
  if (!supabase) return appendProgressNoteAddendum(noteId, body)

  const html = String(body || '').trim()
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (!text) throw new Error('Write the addendum before saving.')

  const { data: row, error: readError } = await supabase
    .from('progress_notes')
    .select(NOTE_COLUMNS)
    .eq('id', noteId)
    .maybeSingle()
  if (readError) throw readError
  if (!row) throw new Error('Note not found')
  const noteRow = row as NoteRow
  if (!enrichProgressNoteLock(noteRow).is_locked) {
    throw new Error('An addendum is added after the note locks.')
  }
  const payload = parseNotePayload(noteRow.encrypted_payload)
  payload.addendums = [
    ...payload.addendums,
    { id: crypto.randomUUID(), body: html, created_at: new Date().toISOString() },
  ]
  const { data, error } = await supabase
    .from('progress_notes')
    .update({ encrypted_payload: payload as unknown as Json })
    .eq('id', noteId)
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
