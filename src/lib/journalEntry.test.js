import { describe, expect, it } from 'vitest'
import { journalContentFromPayload, journalEntryFromRow } from './journalEntry'

describe('journal entry payload', () => {
  it('reads the time and body stored beside the date', () => {
    expect(journalContentFromPayload({
      v: 0,
      time: '15:04',
      body_text: '<p>After clinic</p>',
    })).toEqual({
      time: '15:04',
      body_text: '<p>After clinic</p>',
    })
  })

  it('keeps a short time when seconds are included', () => {
    expect(journalContentFromPayload({ time: '08:30:00', body_text: '<p>Morning</p>' }).time).toBe('08:30')
  })

  it('fills defaults when the payload is empty', () => {
    expect(journalContentFromPayload(null)).toEqual({
      time: '09:00',
      body_text: '<p></p>',
    })
  })

  it('maps a stored row onto the journal book', () => {
    const entry = journalEntryFromRow({
      id: 'entry-1',
      author_id: 'user-1',
      entry_date: '2026-10-04',
      somatic_state: 'Open',
      encrypted_payload: { v: 0, time: '18:10', body_text: '<p>Settled</p>' },
    })
    expect(entry).toMatchObject({
      id: 'entry-1',
      date: '2026-10-04',
      time: '18:10',
      somatic_state: 'Open',
      body_text: '<p>Settled</p>',
    })
  })
})
