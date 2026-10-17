/** Detect PostgREST / Postgres errors for a missing archived_at column. */
export function isMissingArchivedAtColumn(error: { message?: string; details?: string; hint?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  const blob = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return blob.includes('archived_at') && (
    blob.includes('does not exist')
    || blob.includes('could not find')
    || blob.includes('schema cache')
    || error.code === '42703'
    || error.code === 'PGRST204'
  )
}

/**
 * Run a select that prefers columns including archived_at, then retries without it
 * when the live database has not received the archive migration yet.
 */
export async function selectWithOptionalArchive<T>(
  withArchive: () => PromiseLike<{ data: T[] | null; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
  withoutArchive: () => PromiseLike<{ data: T[] | null; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
): Promise<T[]> {
  const first = await withArchive()
  if (!first.error) return first.data || []
  if (!isMissingArchivedAtColumn(first.error)) throw first.error
  const second = await withoutArchive()
  if (second.error) throw second.error
  return second.data || []
}

export async function updateArchiveColumn(
  run: () => PromiseLike<{ data?: unknown; error: { message?: string; details?: string; hint?: string; code?: string } | null }>,
): Promise<void> {
  const { error } = await run()
  if (!error) return
  if (isMissingArchivedAtColumn(error)) {
    throw new Error('Archive is not available until the database migration has been applied.')
  }
  throw error
}
