/**
 * Single Active | Archived switch for archive-aware lists.
 * Keeps archive discovery in one place instead of scattering view modes.
 */
export default function ArchiveScopeToggle({ value = 'active', onChange, activeLabel = 'Active', archivedLabel = 'Archived' }) {
  return (
    <div className="archive-scope" role="group" aria-label="List scope">
      <button
        type="button"
        className={`archive-scope__btn${value === 'active' ? ' archive-scope__btn--active' : ''}`}
        aria-pressed={value === 'active'}
        onClick={() => onChange?.('active')}
      >
        {activeLabel}
      </button>
      <button
        type="button"
        className={`archive-scope__btn${value === 'archived' ? ' archive-scope__btn--active' : ''}`}
        aria-pressed={value === 'archived'}
        onClick={() => onChange?.('archived')}
      >
        {archivedLabel}
      </button>
    </div>
  )
}
