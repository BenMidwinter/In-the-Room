import { journalEntryFromRow, type AppJournalEntry } from '../journalEntry'
import { parseOrThrow, journalEntryInputSchema } from '../schemas'
import { deleteJournalEntry, getJournalEntries, saveJournalEntry } from '../store/journal'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

const JOURNAL_COLUMNS = 'id, author_id, entry_date, somatic_state, encrypted_payload, payload_format'

type JournalRow = {
  id: string
  author_id: string
  entry_date: string
  somatic_state: string | null
  encrypted_payload: Json | null
  payload_format?: string | null
}

function sortEntries(items: AppJournalEntry[]): AppJournalEntry[] {
  return [...items].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return String(b.time || '').localeCompare(String(a.time || ''))
  })
}

export async function listJournalEntries(userId: string): Promise<AppJournalEntry[]> {
  if (!userId) return []
  if (!isSupabaseConfigured()) return getJournalEntries(userId) as AppJournalEntry[]
  const supabase = getSupabase()
  if (!supabase) return getJournalEntries(userId) as AppJournalEntry[]
  const { data, error } = await supabase
    .from('journal_entries')
    .select(JOURNAL_COLUMNS)
    .eq('author_id', userId)
    .order('entry_date', { ascending: false })
  if (error) throw error
  const rows = await withOpenedPayloads('journal_entries', (data || []) as JournalRow[])
  return sortEntries(rows.map((row) => journalEntryFromRow(row)))
}

export async function saveJournalEntryForUser(userId: string, input: {
  id?: string
  date: string
  time?: string
  somatic_state?: string
  body_text?: string
}): Promise<AppJournalEntry> {
  const time = typeof input.time === 'string' ? input.time.slice(0, 5) : input.time
  const parsed = parseOrThrow(journalEntryInputSchema, { ...input, time }, 'Journal entry')
  const somaticState = parsed.somatic_state || 'Grounded'
  const bodyText = parsed.body_text || '<p></p>'
  const entryTime = parsed.time || '09:00'

  if (!isSupabaseConfigured()) {
    return saveJournalEntry(userId, {
      id: parsed.id,
      date: parsed.date,
      time: entryTime,
      somatic_state: somaticState,
      body_text: bodyText,
    }) as AppJournalEntry
  }

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const encrypted_payload = { v: 0, time: entryTime, body_text: bodyText } as unknown as Json
  const existingId = parsed.id && parsed.id !== 'new' ? parsed.id : null

  if (existingId) {
    await sealClinicalRecord('journal_entries', existingId, encrypted_payload)
    const { error } = await supabase
      .from('journal_entries')
      .update({
        entry_date: parsed.date,
        somatic_state: somaticState,
      })
      .eq('id', existingId)
    if (error) throw error
    const { data, error: readError } = await supabase
      .from('journal_entries')
      .select(JOURNAL_COLUMNS)
      .eq('id', existingId)
      .single()
    if (readError) throw readError
    const row = data as JournalRow
    return journalEntryFromRow({
      id: row.id,
      author_id: row.author_id,
      entry_date: row.entry_date,
      somatic_state: row.somatic_state,
      encrypted_payload,
    })
  }

  const created = await createClinicalRecord('journal_entries', {
    entry_date: parsed.date,
    somatic_state: somaticState,
  }, encrypted_payload)
  const { data, error } = await supabase
    .from('journal_entries')
    .select(JOURNAL_COLUMNS)
    .eq('id', created.id)
    .single()
  if (error) throw error
  const row = data as JournalRow
  return journalEntryFromRow({
    id: row.id,
    author_id: row.author_id,
    entry_date: row.entry_date,
    somatic_state: row.somatic_state,
    encrypted_payload,
  })
}

export async function deleteJournalEntryForUser(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId || entryId === 'new') return
  if (!isSupabaseConfigured()) {
    deleteJournalEntry(userId, entryId)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('author_id', userId)
  if (error) throw error
}
