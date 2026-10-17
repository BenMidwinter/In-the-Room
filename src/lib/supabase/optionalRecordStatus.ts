import { isMissingArchivedAtColumn, selectWithOptionalArchive, updateArchiveColumn } from './optionalArchive'

export { isMissingArchivedAtColumn, selectWithOptionalArchive, updateArchiveColumn }

/** Detect PostgREST / Postgres errors for a missing trashed_at column. */
export function isMissingTrashedAtColumn(error: { message?: string; details?: string; hint?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  const blob = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  const mentionsTrash = blob.includes('trashed_at')
  const missingColumn = (
    blob.includes('does not exist')
    || blob.includes('could not find')
    || blob.includes('schema cache')
    || error.code === '42703'
    || error.code === 'PGRST204'
  )
  return mentionsTrash && missingColumn
}

export function isMissingStatusColumn(error: { message?: string; details?: string; hint?: string; code?: string } | null | undefined): boolean {
  return isMissingArchivedAtColumn(error) || isMissingTrashedAtColumn(error)
}

/**
 * Prefer select with archived_at + trashed_at, falling back gracefully when
 * either column is missing on an older environment.
 */
export async function selectWithOptionalStatus<T>(
  withStatus: () => PromiseLike<{ data: T[] | null; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
  withArchiveOnly: () => PromiseLike<{ data: T[] | null; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
  withoutStatus: () => PromiseLike<{ data: T[] | null; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
): Promise<T[]> {
  const first = await withStatus()
  if (!first.error) return first.data || []
  if (isMissingTrashedAtColumn(first.error)) {
    const second = await withArchiveOnly()
    if (!second.error) return second.data || []
    if (!isMissingArchivedAtColumn(second.error)) throw second.error
    const third = await withoutStatus()
    if (third.error) throw third.error
    return third.data || []
  }
  if (isMissingArchivedAtColumn(first.error)) {
    const fallback = await withoutStatus()
    if (fallback.error) throw fallback.error
    return fallback.data || []
  }
  throw first.error
}

export async function updateStatusColumns(
  run: () => PromiseLike<{ data?: unknown; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
): Promise<void> {
  const { error } = await run()
  if (!error) return
  if (isMissingStatusColumn(error)) {
    throw new Error('Archive and trash are not available until the database migration has been applied.')
  }
  throw error
}
