/** Document lifecycle: Active → Archive (read-only) → Trash (30-day retention). */

export const RECORD_STATUSES = ['active', 'archive', 'trash']

export const STATUS_LABEL = {
  active: 'Active',
  archive: 'Archive',
  trash: 'Trash',
}

export const STATUS_FILTER_OPTIONS = ['Active', 'Archive', 'Trash']

/** Narrow Status column for RecordTable. Filter defaults to Active via defaultFilters. */
export const STATUS_COLUMN = {
  key: 'status',
  label: 'Status',
  filter: { type: 'choice', options: STATUS_FILTER_OPTIONS },
  sort: 'text',
  className: 'record-table__col--status',
}

export const STATUS_DEFAULT_FILTERS = { status: 'Active' }

export const TRASH_RETENTION_DAYS = 30

export function recordStatusOf(item) {
  if (item?.trashed_at) return 'trash'
  if (item?.archived_at) return 'archive'
  return 'active'
}

export function statusLabelOf(item) {
  return STATUS_LABEL[recordStatusOf(item)]
}

/** Fields to write when moving to a lifecycle status. */
export function statusTimestamps(nextStatus, current = {}) {
  const now = new Date().toISOString()
  if (nextStatus === 'active') {
    return { archived_at: null, trashed_at: null }
  }
  if (nextStatus === 'archive') {
    return {
      archived_at: current.archived_at || now,
      trashed_at: null,
    }
  }
  if (nextStatus === 'trash') {
    return {
      archived_at: current.archived_at || now,
      trashed_at: now,
    }
  }
  throw new Error(`Unknown status: ${nextStatus}`)
}

export function trashExpiresAt(trashedAt) {
  if (!trashedAt) return null
  const start = new Date(trashedAt)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setDate(end.getDate() + TRASH_RETENTION_DAYS)
  return end
}

export function isTrashExpired(trashedAt, now = new Date()) {
  const end = trashExpiresAt(trashedAt)
  if (!end) return false
  return end.getTime() <= now.getTime()
}

/** Ellipsis menu items for a row, given its status and action handlers. */
export function statusMenuItems(status, {
  onEdit,
  onView,
  onArchive,
  onRestore,
  onDelete,
  onRestoreToArchive,
  onPermanentDelete,
  onDownload,
}) {
  if (status === 'active') {
    return [
      { label: 'Edit', onSelect: onEdit },
      { label: 'Archive', onSelect: onArchive },
      { label: 'Download', onSelect: onDownload, hidden: !onDownload },
    ]
  }
  if (status === 'archive') {
    return [
      { label: 'View', onSelect: onView },
      { label: 'Restore', onSelect: onRestore },
      { label: 'Delete', onSelect: onDelete, danger: true },
    ]
  }
  return [
    { label: 'Restore to archive', onSelect: onRestoreToArchive },
    { label: 'Permanently delete', onSelect: onPermanentDelete, danger: true },
  ]
}

/** Bulk action definitions for the current status filter. */
export function bulkActionsForStatus(statusFilterLabel, handlers) {
  const status = String(statusFilterLabel || 'Active').toLowerCase()
  if (status === 'archive') {
    return [
      { key: 'restore', label: 'Restore', onSelect: handlers.onRestore },
      { key: 'delete', label: 'Delete', onSelect: handlers.onDelete, danger: true },
    ]
  }
  if (status === 'trash') {
    return [
      { key: 'restore-archive', label: 'Restore to archive', onSelect: handlers.onRestoreToArchive },
      { key: 'purge', label: 'Permanently delete', onSelect: handlers.onPermanentDelete, danger: true },
    ]
  }
  return [
    { key: 'archive', label: 'Archive', onSelect: handlers.onArchive },
    { key: 'download', label: 'Download', onSelect: handlers.onDownload, hidden: !handlers.onDownload },
  ]
}
