import { letterInputSchema, parseOrThrow } from '../schemas'
import { db } from '../data/collections'
import { saveLetter } from '../store/clinicalDocs'
import type { StoreRecord } from '../types/collections'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

const LETTER_COLUMNS = 'id, owner_id, organization_id, client_id, episode_id, author_id, letter_date, encrypted_payload, payload_format, created_at, updated_at, archived_at'

type LetterPayload = {
  v: 0
  title: string
  content: string
  recipient: string
}

type LetterRow = {
  id: string
  owner_id: string
  organization_id: string | null
  client_id: string
  episode_id: string | null
  author_id: string
  letter_date: string | null
  encrypted_payload: Json
  payload_format: string
  created_at: string
  updated_at: string
  archived_at?: string | null
}

export type AppLetter = {
  id: string
  client_id: string
  author_id: string
  title: string
  content: string
  recipient: string
  letter_date: string
  created_at: string
  updated_at: string
  archived_at?: string | null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseLetter(raw: Json | null | undefined): LetterPayload {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return {
    v: 0,
    title: String(row.title || 'Untitled letter'),
    content: String(row.content || '<p></p>'),
    recipient: String(row.recipient || ''),
  }
}

function toAppLetter(row: LetterRow): AppLetter {
  const payload = parseLetter(row.encrypted_payload)
  return {
    id: row.id,
    client_id: row.client_id,
    author_id: row.author_id,
    title: payload.title,
    content: payload.content,
    recipient: payload.recipient,
    letter_date: row.letter_date || String(row.created_at).slice(0, 10),
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
  }
}

function remember(letter: AppLetter): AppLetter {
  const idx = db.letters.findIndex((row) => row.id === letter.id)
  if (idx === -1) db.letters.push(letter as unknown as StoreRecord)
  else db.letters[idx] = { ...db.letters[idx], ...letter } as StoreRecord
  return db.letters[idx === -1 ? db.letters.length - 1 : idx] as unknown as AppLetter
}

function localLetters(clientId: string): AppLetter[] {
  return db.letters
    .filter((row) => row.client_id === clientId)
    .map((row) => row as unknown as AppLetter)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export async function listLettersForClient(clientId: string): Promise<AppLetter[]> {
  if (!clientId || !isSupabaseConfigured() || !isUuid(clientId)) return localLetters(clientId)
  const supabase = getSupabase()
  if (!supabase) return localLetters(clientId)
  const { data, error } = await supabase
    .from('letters')
    .select(LETTER_COLUMNS)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const rows = await withOpenedPayloads('letters', (data || []) as LetterRow[])
  return rows.map((row) => remember(toAppLetter(row)))
}

export async function saveLetterForUser(payload: Record<string, unknown>, userId: string): Promise<AppLetter> {
  const parsed = parseOrThrow(letterInputSchema, payload, 'Letter') as Record<string, unknown>
  const title = String(parsed.title || 'Untitled letter')
  const content = String(parsed.content || '<p></p>')
  const recipient = String(parsed.recipient || '')
  const letterDate = String(parsed.letter_date || new Date().toISOString().slice(0, 10))
  const clientId = String(parsed.client_id || '')
  const existingId = isUuid(parsed.id) ? String(parsed.id) : null
  const localOnly = !isSupabaseConfigured() || (parsed.id ? !existingId : !isUuid(clientId))
  if (localOnly) {
    return saveLetter({
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      client_id: clientId,
      title,
      content,
      recipient,
      letter_date: letterDate,
    }, userId) as AppLetter
  }
  const supabase = getSupabase()
  if (!supabase) {
    return saveLetter(parsed, userId) as AppLetter
  }

  const body = { v: 0, title, content, recipient }
  if (existingId) {
    await sealClinicalRecord('letters', existingId, body)
    const { data, error } = await supabase
      .from('letters')
      .update({ letter_date: letterDate })
      .eq('id', existingId)
      .select(LETTER_COLUMNS)
      .single()
    if (error) throw error
    return remember(toAppLetter({
      ...(data as LetterRow),
      encrypted_payload: body as unknown as Json,
      payload_format: 'envelope',
    }))
  }

  const created = await createClinicalRecord('letters', {
    client_id: clientId,
    letter_date: letterDate,
  }, body)
  const { data, error } = await supabase
    .from('letters')
    .select(LETTER_COLUMNS)
    .eq('id', created.id)
    .single()
  if (error) throw error
  return remember(toAppLetter({
    ...(data as LetterRow),
    encrypted_payload: body as unknown as Json,
    payload_format: 'envelope',
  }))
}

export async function setLetterArchived(id: string, archived: boolean): Promise<AppLetter> {
  if (!id) throw new Error('Letter not found')
  const archivedAt = archived ? new Date().toISOString() : null
  if (!isSupabaseConfigured() || !isUuid(id)) {
    const idx = db.letters.findIndex((row) => row.id === id)
    if (idx === -1) throw new Error('Letter not found')
    db.letters[idx] = { ...db.letters[idx], archived_at: archivedAt } as StoreRecord
    return db.letters[idx] as unknown as AppLetter
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('letters')
    .update({ archived_at: archivedAt })
    .eq('id', id)
    .select(LETTER_COLUMNS)
    .single()
  if (error) throw error
  const [opened] = await withOpenedPayloads('letters', [data as LetterRow])
  return remember(toAppLetter(opened))
}

export async function deleteLetter(id: string): Promise<void> {
  if (!id) return
  if (!isSupabaseConfigured() || !isUuid(id)) {
    const idx = db.letters.findIndex((row) => row.id === id)
    if (idx !== -1) db.letters.splice(idx, 1)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('letters').delete().eq('id', id)
  if (error) throw error
  const idx = db.letters.findIndex((row) => row.id === id)
  if (idx !== -1) db.letters.splice(idx, 1)
}
