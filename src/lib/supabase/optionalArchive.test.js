import { describe, expect, it } from 'vitest'
import { isMissingArchivedAtColumn, selectWithOptionalArchive, updateArchiveColumn } from './optionalArchive'

describe('optionalArchive', () => {
  it('detects missing archived_at column errors', () => {
    expect(isMissingArchivedAtColumn({ message: 'column archived_at does not exist', code: '42703' })).toBe(true)
    expect(isMissingArchivedAtColumn({ message: 'Could not find the archived_at column in the schema cache', code: 'PGRST204' })).toBe(true)
    expect(isMissingArchivedAtColumn({ message: 'permission denied' })).toBe(false)
    expect(isMissingArchivedAtColumn(null)).toBe(false)
  })

  it('falls back when archived_at is missing, otherwise returns first result', async () => {
    const withArchive = async () => ({
      data: null,
      error: { message: 'column archived_at does not exist', code: '42703' },
    })
    const withoutArchive = async () => ({
      data: [{ id: '1' }],
      error: null,
    })
    await expect(selectWithOptionalArchive(withArchive, withoutArchive)).resolves.toEqual([{ id: '1' }])

    await expect(selectWithOptionalArchive(
      async () => ({ data: [{ id: 'ok' }], error: null }),
      async () => ({ data: [], error: null }),
    )).resolves.toEqual([{ id: 'ok' }])
  })

  it('surfaces a clear error when archive updates hit a missing column', async () => {
    await expect(updateArchiveColumn(async () => ({
      error: { message: 'column archived_at does not exist', code: '42703' },
    }))).rejects.toThrow(/Archive is not available/)
  })
})
