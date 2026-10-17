import { journalEntryFromRow, type AppJournalEntry } from '../journalEntry'
import { parseOrThrow, journalEntryInputSchema } from '../schemas'
import { deleteJournalEntry, getJournalEntries, saveJournalEntry } from '../store/journal'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { selectWithOptionalArchive, updateArchiveColumn } from './optionalArchive'

const JOURNAL_COLUMNS_BASE = 'id, author_id, entry_date, somatic_state, encrypted_payload, payload_format'
const JOURNAL_COLUMNS = `${JOURNAL_COLUMNS_BASE}, archived_at`

type JournalRow = {
  id: string
  author_id: string
  entry_date: string
  somatic_state: string | null
  encrypted_payload: Json | null
  payload_format?: string | null
  archived_at?: string | null
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
  const data = await selectWithOptionalArchive(
    () => supabase.from('journal_entries').select(JOURNAL_COLUMNS).eq('author_id', userId).order('entry_date', { ascending: false }),
    () => supabase.from('journal_entries').select(JOURNAL_COLUMNS_BASE).eq('author_id', userId).order('entry_date', { ascending: false }),
  )
  const rows = await withOpenedPayloads('journal_entries', data as JournalRow[])
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
      .select(JOURNAL_COLUMNS_BASE)
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
      archived_at: row.archived_at,
    })
  }

  const created = await createClinicalRecord('journal_entries', {
    entry_date: parsed.date,
    somatic_state: somaticState,
  }, encrypted_payload)
  const { data, error } = await supabase
    .from('journal_entries')
    .select(JOURNAL_COLUMNS_BASE)
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
    archived_at: row.archived_at,
  })
}

export async function setJournalEntryArchived(userId: string, entryId: string, archived: boolean): Promise<AppJournalEntry> {
  if (!userId || !entryId || entryId === 'new') throw new Error('Entry not found')
  const archivedAt = archived ? new Date().toISOString() : null
  if (!isSupabaseConfigured()) {
    const entries = getJournalEntries(userId) as AppJournalEntry[]
    const current = entries.find((entry) => entry.id === entryId)
    if (!current) throw new Error('Entry not found')
    const next = { ...current, archived_at: archivedAt }
    // Local store does not persist archived_at yet; return the updated shape for the UI.
    return next
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  await updateArchiveColumn(() => (
    supabase.from('journal_entries').update({ archived_at: archivedAt }).eq('id', entryId).eq('author_id', userId)
  ))
  const rows = await selectWithOptionalArchive(
    () => supabase.from('journal_entries').select(JOURNAL_COLUMNS).eq('id', entryId).eq('author_id', userId),
    () => supabase.from('journal_entries').select(JOURNAL_COLUMNS_BASE).eq('id', entryId).eq('author_id', userId),
  )
  if (!rows[0]) throw new Error('Entry not found')
  const [opened] = await withOpenedPayloads('journal_entries', [{ ...(rows[0] as JournalRow), archived_at: archivedAt }])
  return journalEntryFromRow(opened)
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
