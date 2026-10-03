import { getPersonaVisibilitySummary } from '../lib/demoPersonas'

export default function IdentityVisibilityBanner({
  persona,
  visibleCount,
  totalCount,
  context = 'calendar',
  calendarOwnerLabel = null,
}) {
  if (!persona) return null
  if (totalCount === 0 && context !== 'service-lead') return null

  const { tone, message } = getPersonaVisibilitySummary(persona, visibleCount, totalCount)
  const isRestricted = tone === 'restricted'

  return (
    <div
      className={`identity-banner${isRestricted ? ' identity-banner--restricted' : ' identity-banner--open'}`}
      role="status"
    >
      <div className="identity-banner__row">
        <span className={`identity-banner__badge${isRestricted ? ' identity-banner__badge--restricted' : ''}`}>
          {isRestricted ? 'Filtered view' : 'Full visibility'}
        </span>
        <span className="identity-banner__name">{persona.name}</span>
        <span className="identity-banner__role">({persona.label})</span>
        {context === 'calendar' && <span className="identity-banner__context">· Calendar</span>}
        {context === 'service-lead' && <span className="identity-banner__context">· Organisation overview</span>}
        {calendarOwnerLabel && (
          <span className="identity-banner__context">· {calendarOwnerLabel}</span>
        )}
      </div>
      <p className="identity-banner__message">{message}</p>
    </div>
  )
}
