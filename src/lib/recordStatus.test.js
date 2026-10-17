import { describe, expect, it } from 'vitest'
import { trashCountdownLabel, TRASH_RETENTION_DAYS } from './recordStatus'

describe('trashCountdownLabel', () => {
  it('counts down across the 30-day retention', () => {
    const trashedAt = '2026-10-01T12:00:00.000Z'
    const now = new Date('2026-10-01T12:00:00.000Z')
    expect(trashCountdownLabel(trashedAt, now)).toBe(`Deletes in ${TRASH_RETENTION_DAYS} days`)
    const later = new Date('2026-10-30T12:00:00.000Z')
    expect(trashCountdownLabel(trashedAt, later)).toBe('Deletes in 1 day')
  })

  it('says the record deletes today once the countdown has ended', () => {
    const trashedAt = '2026-10-01T12:00:00.000Z'
    const now = new Date('2026-10-31T13:00:00.000Z')
    expect(trashCountdownLabel(trashedAt, now)).toBe('Deletes today')
  })
})
