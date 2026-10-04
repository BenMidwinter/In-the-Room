import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, getJournalEntries, saveJournalEntry } from '../store'

beforeEach(() => {
  resetStore()
})

describe('journal entries', () => {
  it('sorts by date desc then time desc for the author', () => {
    saveJournalEntry('user-1', { date: '2026-07-01', time: '09:00', body_text: '<p>Earlier</p>' })
    saveJournalEntry('user-1', { date: '2026-07-02', time: '09:00', body_text: '<p>Later day</p>' })
    saveJournalEntry('user-1', { date: '2026-07-02', time: '15:00', body_text: '<p>Later time</p>' })
    const entries = getJournalEntries('user-1')
    expect(entries.map(entry => `${entry.date} ${entry.time}`)).toEqual([
      '2026-07-02 15:00',
      '2026-07-02 09:00',
      '2026-07-01 09:00',
    ])
  })

  it('scopes entries to the requesting author', () => {
    saveJournalEntry('user-1', { date: '2026-07-01', body_text: '<p>Mine</p>' })
    saveJournalEntry('user-2', { date: '2026-07-01', body_text: '<p>Theirs</p>' })
    expect(getJournalEntries('user-1')).toHaveLength(1)
    expect(getJournalEntries('user-nobody')).toHaveLength(0)
  })

  it('creates a new entry with defaults', () => {
    const created = saveJournalEntry('user-1', {
      date: '2026-07-01',
      body_text: '<p>Reflection</p>',
    })
    expect(created.id).toMatch(/^journal-/)
    expect(created.somatic_state).toBe('Grounded')
    expect(getJournalEntries('user-1')[0].id).toBe(created.id)
  })

  it('updates an existing entry for the same author', () => {
    const created = saveJournalEntry('user-1', {
      date: '2026-06-24',
      body_text: '<p>First</p>',
    })
    const updated = saveJournalEntry('user-1', {
      id: created.id,
      date: '2026-06-24',
      body_text: '<p>Updated reflection</p>',
    })
    expect(updated.body_text).toContain('Updated reflection')
  })

  it('rejects an invalid somatic state', () => {
    expect(() => saveJournalEntry('user-1', {
      date: '2026-07-01',
      somatic_state: 'Overcaffeinated',
    })).toThrow(/Journal entry/)
  })
})
