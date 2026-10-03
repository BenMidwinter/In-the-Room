import FormOverlay from './FormOverlay'

export const SERIES_SCOPES = [
  {
    id: 'this',
    title: 'This appointment',
    description: 'Only the selected session',
  },
  {
    id: 'following',
    title: 'This and all following appointments',
    description: 'This session and every later one in the series',
  },
  {
    id: 'all',
    title: 'All appointments',
    description: 'Every session in the series',
  },
]

/**
 * Pick a series edit/delete scope. `countForScope(id)` optionally labels how many
 * appointments each choice will affect.
 */
export default function SeriesScopeDialog({
  action = 'edit',
  onSelect,
  onCancel,
  countForScope,
}) {
  const verb = action === 'delete' ? 'Delete' : 'Edit'
  return (
    <FormOverlay
      title={`${verb} recurring appointments`}
      eyebrow="Series"
      meta="Choose how far this change should apply."
      onClose={onCancel}
      size="sm"
    >
      <div className="series-scope" role="list">
        {SERIES_SCOPES.map((scope) => {
          const count = countForScope?.(scope.id)
          return (
            <button
              key={scope.id}
              type="button"
              className="series-scope__option"
              onClick={() => onSelect?.(scope.id)}
            >
              <span className="series-scope__title">{scope.title}</span>
              <span className="series-scope__desc text-small text-muted">
                {scope.description}
                {typeof count === 'number' ? ` · ${count} session${count === 1 ? '' : 's'}` : ''}
              </span>
            </button>
          )
        })}
      </div>
      <div className="form-actions" style={{ marginTop: '1.25rem' }}>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </FormOverlay>
  )
}
