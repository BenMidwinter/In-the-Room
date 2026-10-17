/** Floating/inline toolbar when table rows are selected for bulk status actions. */
export default function BulkStatusBar({ count, noun = 'items', actions = [], onClear }) {
  if (!count) return null
  const visible = actions.filter((action) => !action.hidden)
  if (!visible.length) return null

  return (
    <div className="bulk-status-bar" role="region" aria-label="Bulk actions">
      <span className="bulk-status-bar__count">
        {count} {count === 1 ? noun.replace(/s$/, '') : noun} selected
      </span>
      <div className="bulk-status-bar__actions">
        {visible.map((action) => (
          <button
            key={action.key || action.label}
            type="button"
            className={action.danger ? 'danger' : 'secondary'}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            {action.label}
          </button>
        ))}
        {onClear ? (
          <button type="button" className="secondary" onClick={onClear}>
            Deselect
          </button>
        ) : null}
      </div>
    </div>
  )
}
