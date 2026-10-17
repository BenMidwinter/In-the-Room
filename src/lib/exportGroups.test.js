import { describe, expect, it } from 'vitest'
import { CLIENT_EXPORT_GROUPS, PRACTICE_EXPORT_GROUPS } from './exportGroups'

describe('export groups', () => {
  it('keeps stable ids for the client and practice checklists', () => {
    const ids = [...CLIENT_EXPORT_GROUPS, ...PRACTICE_EXPORT_GROUPS].map((group) => group.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('notes')
    expect(ids).toContain('invoices')
    expect(ids).toContain('journal')
    expect(ids).toContain('letterheads')
  })
})