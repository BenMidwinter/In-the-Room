import { journalEntryFromRow, type AppJournalEntry } from '../journalEntry'
import { parseOrThrow, journalEntryInputSchema } from '../schemas'
import { getJournalEntries, saveJournalEntry } from '../store/journal'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

const JOURNAL_COLUMNS = 'id, author_id, entry_date, somatic_state, encrypted_payload'

type JournalRow = {
  id: string
  author_id: string
  entry_date: string
  somatic_state: string | null
  encrypted_payload: Json | null
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
  if (!isSupabaseConfigured()) return getJournalEntries(userId)
  const supabase = getSupabase()
  if (!supabase) return getJournalEntries(userId)
  const { data, error } = await supabase
    .from('journal_entries')
    .select(JOURNAL_COLUMNS)
    .eq('author_id', userId)
    .order('entry_date', { ascending: false })
  if (error) throw error
  return sortEntries((data || []).map((row) => journalEntryFromRow(row as JournalRow)))
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
    })
  }

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const encrypted_payload = { v: 0, time: entryTime, body_text: bodyText } as unknown as Json
  const existingId = parsed.id && parsed.id !== 'new' ? parsed.id : null

  if (existingId) {
    const { data, error } = await supabase
      .from('journal_entries')
      .update({
        entry_date: parsed.date,
        somatic_state: somaticState,
        encrypted_payload,
      })
      .eq('id', existingId)
      .select(JOURNAL_COLUMNS)
      .single()
    if (error) throw error
    return journalEntryFromRow(data as JournalRow)
  }

  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      owner_id: user.id,
      author_id: user.id,
      entry_date: parsed.date,
      somatic_state: somaticState,
      encrypted_payload,
    })
    .select(JOURNAL_COLUMNS)
    .single()
  if (error) throw error
  return journalEntryFromRow(data as JournalRow)
}
