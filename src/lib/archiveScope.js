/** List scope for archive-aware tables. Default is active (hide archived). */
export const ARCHIVE_SCOPES = ['active', 'archived']

export function filterByArchiveScope(items, scope = 'active', getArchivedAt = (item) => item?.archived_at) {
  const list = Array.isArray(items) ? items : []
  if (scope === 'archived') return list.filter((item) => Boolean(getArchivedAt(item)))
  return list.filter((item) => !getArchivedAt(item))
}
