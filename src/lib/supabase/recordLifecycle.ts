import { isTrashExpired, statusTimestamps } from '../recordStatus'
import { selectWithOptionalStatus, updateStatusColumns } from './optionalRecordStatus'
import type { SupabaseClient } from '@supabase/supabase-js'

type Status = 'active' | 'archive' | 'trash'

type TimestampRow = {
  archived_at?: string | null
  trashed_at?: string | null
}

/**
 * Apply a lifecycle status change (active / archive / trash) on a table row.
 * Soft-fails through selectWithOptionalStatus when columns are still migrating.
 */
export async function applyRecordStatus<T extends TimestampRow>(options: {
  supabase: SupabaseClient
  table: string
  id: string
  nextStatus: Status
  current?: TimestampRow
  columnsFull: string
  columnsArchive: string
  columnsBase: string
  eq?: Record<string, string>
  mapRow: (row: T) => T
}): Promise<T> {
  const patch = statusTimestamps(options.nextStatus, options.current || {})
  await updateStatusColumns(() => {
    let query = options.supabase.from(options.table).update(patch).eq('id', options.id)
    if (options.eq) {
      for (const [key, value] of Object.entries(options.eq)) {
        query = query.eq(key, value)
      }
    }
    return query
  })

  let read = options.supabase.from(options.table).select(options.columnsFull).eq('id', options.id)
  let archiveOnly = options.supabase.from(options.table).select(options.columnsArchive).eq('id', options.id)
  let base = options.supabase.from(options.table).select(options.columnsBase).eq('id', options.id)
  if (options.eq) {
    for (const [key, value] of Object.entries(options.eq)) {
      read = read.eq(key, value)
      archiveOnly = archiveOnly.eq(key, value)
      base = base.eq(key, value)
    }
  }

  const rows = await selectWithOptionalStatus(
    () => read,
    () => archiveOnly,
    () => base,
  )
  if (!rows[0]) throw new Error('Record not found')
  return options.mapRow({ ...(rows[0] as T), ...patch })
}

/** Hard-delete trash rows older than the retention window. */
export async function purgeExpiredTrashRows(options: {
  supabase: SupabaseClient
  table: string
  idKey?: string
  rows: Array<{ id: string; trashed_at?: string | null }>
}): Promise<string[]> {
  const expired = options.rows.filter((row) => isTrashExpired(row.trashed_at))
  const removed: string[] = []
  for (const row of expired) {
    const { error } = await options.supabase.from(options.table).delete().eq('id', row.id)
    if (!error) removed.push(row.id)
  }
  return removed
}
