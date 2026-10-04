import type { Json } from './supabase/database.types'

export type AppJournalEntry = {
  id: string
  author_id: string
  date: string
  time: string
  somatic_state: string
  body_text: string
}

const SOMATIC_STATES = new Set([
  'Grounded',
  'Activated',
  'Fatigued',
  'Open',
  'Constricted',
  'Settled',
])

export function journalContentFromPayload(payload: Json | null | undefined): { time: string; body_text: string } {
  const row = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
  const rawTime = typeof row.time === 'string' ? row.time : ''
  const timeMatch = rawTime.match(/^(\d{2}:\d{2})/)
  const body = typeof row.body_text === 'string' && row.body_text.trim() ? row.body_text : '<p></p>'
  return {
    time: timeMatch ? timeMatch[1] : '09:00',
    body_text: body,
  }
}

export function journalEntryFromRow(row: {
  id: string
  author_id: string
  entry_date: string
  somatic_state: string | null
  encrypted_payload: Json | null
}): AppJournalEntry {
  const content = journalContentFromPayload(row.encrypted_payload)
  return {
    id: row.id,
    author_id: row.author_id,
    date: String(row.entry_date).slice(0, 10),
    time: content.time,
    somatic_state: row.somatic_state && SOMATIC_STATES.has(row.somatic_state) ? row.somatic_state : 'Grounded',
    body_text: content.body_text,
  }
}
