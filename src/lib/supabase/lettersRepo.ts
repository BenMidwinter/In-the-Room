import { letterInputSchema, parseOrThrow } from '../schemas'
import { db } from '../data/collections'
import { isTrashExpired, statusTimestamps } from '../recordStatus'
import { saveLetter } from '../store/clinicalDocs'
import type { StoreRecord } from '../types/collections'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { selectWithOptionalStatus, updateStatusColumns } from './optionalRecordStatus'

const LETTER_COLUMNS_BASE = 'id, owner_id, organization_id, client_id, episode_id, author_id, letter_date, encrypted_payload, payload_format, created_at, updated_at'
const LETTER_COLUMNS_ARCHIVE = `${LETTER_COLUMNS_BASE}, archived_at`
const LETTER_COLUMNS = `${LETTER_COLUMNS_ARCHIVE}, trashed_at`

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
  trashed_at?: string | null
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
  trashed_at?: string | null
}

type LetterStatus = 'active' | 'archive' | 'trash'

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
    trashed_at: row.trashed_at || null,
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
    .filter((row) => !isTrashExpired(row.trashed_at))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

async function purgeExpired(clientId: string, rows: LetterRow[]) {
  const supabase = getSupabase()
  if (!supabase) return rows
  const keep: LetterRow[] = []
  for (const row of rows) {
    if (!isTrashExpired(row.trashed_at)) {
      keep.push(row)
      continue
    }
    await supabase.from('letters').delete().eq('id', row.id).eq('client_id', clientId)
    const idx = db.letters.findIndex((item) => item.id === row.id)
    if (idx !== -1) db.letters.splice(idx, 1)
  }
  return keep
}

export async function listLettersForClient(clientId: string): Promise<AppLetter[]> {
  if (!clientId || !isSupabaseConfigured() || !isUuid(clientId)) return localLetters(clientId)
  const supabase = getSupabase()
  if (!supabase) return localLetters(clientId)
  const data = await selectWithOptionalStatus(
    () => supabase.from('letters').select(LETTER_COLUMNS).eq('client_id', clientId).order('updated_at', { ascending: false }),
    () => supabase.from('letters').select(LETTER_COLUMNS_ARCHIVE).eq('client_id', clientId).order('updated_at', { ascending: false }),
    () => supabase.from('letters').select(LETTER_COLUMNS_BASE).eq('client_id', clientId).order('updated_at', { ascending: false }),
  )
  const surviving = await purgeExpired(clientId, data as LetterRow[])
  const rows = await withOpenedPayloads('letters', surviving)
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
      .select(LETTER_COLUMNS_BASE)
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
    .select(LETTER_COLUMNS_BASE)
    .eq('id', created.id)
    .single()
  if (error) throw error
  return remember(toAppLetter({
    ...(data as LetterRow),
    encrypted_payload: body as unknown as Json,
    payload_format: 'envelope',
  }))
}

export async function setLetterStatus(id: string, nextStatus: LetterStatus): Promise<AppLetter> {
  if (!id) throw new Error('Letter not found')
  if (!isSupabaseConfigured() || !isUuid(id)) {
    const idx = db.letters.findIndex((row) => row.id === id)
    if (idx === -1) throw new Error('Letter not found')
    const current = db.letters[idx] as unknown as AppLetter
    const patch = statusTimestamps(nextStatus, current)
    db.letters[idx] = { ...db.letters[idx], ...patch } as StoreRecord
    return db.letters[idx] as unknown as AppLetter
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const currentRows = await selectWithOptionalStatus(
    () => supabase.from('letters').select(LETTER_COLUMNS).eq('id', id),
    () => supabase.from('letters').select(LETTER_COLUMNS_ARCHIVE).eq('id', id),
    () => supabase.from('letters').select(LETTER_COLUMNS_BASE).eq('id', id),
  )
  if (!currentRows[0]) throw new Error('Letter not found')
  const current = currentRows[0] as LetterRow
  const patch = statusTimestamps(nextStatus, current)
  await updateStatusColumns(() => supabase.from('letters').update(patch).eq('id', id))
  const [opened] = await withOpenedPayloads('letters', [{ ...current, ...patch }])
  return remember(toAppLetter(opened))
}

/** @deprecated Prefer setLetterStatus */
export async function setLetterArchived(id: string, archived: boolean): Promise<AppLetter> {
  return setLetterStatus(id, archived ? 'archive' : 'active')
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
