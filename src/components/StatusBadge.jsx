import { STATUS_LABEL, recordStatusOf } from '../lib/recordStatus'

/** Compact lifecycle badge: Active (green), Archive (grey), Trash (red). */
export default function StatusBadge({ status, item }) {
  const resolved = status || recordStatusOf(item)
  const label = STATUS_LABEL[resolved] || 'Active'
  return (
    <span className={`status-badge status-badge--${resolved}`}>
      {label}
    </span>
  )
}
