import { db, uid } from '../data/collections'
import { parseOrThrow, journalEntryInputSchema } from '../schemas'

export function getJournalEntries(userId) {
  return db.journalEntries
    .filter(e => e.author_id === userId)
    .sort((a, b) => {
      const byDate = String(b.date).localeCompare(String(a.date))
      if (byDate !== 0) return byDate
      return String(b.time || '').localeCompare(String(a.time || ''))
    })
}

export function saveJournalEntry(userId, payload) {
  payload = parseOrThrow(journalEntryInputSchema, payload, 'Journal entry')
  const now = payload.date
  if (payload.id) {
    const idx = db.journalEntries.findIndex(e => e.id === payload.id && e.author_id === userId)
    if (idx >= 0) {
      db.journalEntries[idx] = {
        ...db.journalEntries[idx],
        date: payload.date,
        time: payload.time || db.journalEntries[idx].time || '09:00',
        somatic_state: payload.somatic_state,
        body_text: payload.body_text,
      }
      return db.journalEntries[idx]
    }
  }
  const created = {
    id: uid('journal'),
    author_id: userId,
    date: payload.date || now,
    time: payload.time || '09:00',
    somatic_state: payload.somatic_state || 'Grounded',
    body_text: payload.body_text || '<p></p>',
  }
  db.journalEntries.push(created)
  return created
}
