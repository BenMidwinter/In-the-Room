import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, getJournalEntries, saveJournalEntry } from '../store'

beforeEach(() => {
  resetStore()
})

describe('getJournalEntries', () => {
  it('sorts by date desc then time desc for the author', () => {
    const entries = getJournalEntries('user-sarah')
    expect(entries.length).toBeGreaterThan(1)
    for (let i = 1; i < entries.length; i += 1) {
      const prev = entries[i - 1]
      const curr = entries[i]
      expect(prev.date.localeCompare(curr.date)).toBeGreaterThanOrEqual(0)
      if (prev.date === curr.date) {
        expect(String(prev.time || '').localeCompare(String(curr.time || ''))).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('scopes entries to the requesting author', () => {
    expect(getJournalEntries('user-daniel')).toHaveLength(1)
    expect(getJournalEntries('user-daniel')[0].id).toBe('journal-4')
    expect(getJournalEntries('user-nobody')).toHaveLength(0)
  })
})

describe('saveJournalEntry', () => {
  it('creates a new entry with defaults', () => {
    const created = saveJournalEntry('user-sarah', {
      date: '2026-07-01',
      body_text: '<p>Reflection</p>',
    })
    expect(created.id).toMatch(/^journal-/)
    expect(created.somatic_state).toBe('Grounded')
    expect(getJournalEntries('user-sarah')[0].id).toBe(created.id)
  })

  it('updates an existing entry for the same author', () => {
    const updated = saveJournalEntry('user-sarah', {
      id: 'journal-1',
      date: '2026-06-24',
      body_text: '<p>Updated reflection</p>',
    })
    expect(updated.body_text).toContain('Updated reflection')
  })

  it('rejects an invalid somatic state', () => {
    expect(() => saveJournalEntry('user-sarah', {
      date: '2026-07-01',
      somatic_state: 'Overcaffeinated',
    })).toThrow(/Journal entry/)
  })
})
