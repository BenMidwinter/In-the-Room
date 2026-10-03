import { useState } from 'react'
import { getIntakeForm, formatInsertText } from '../../lib/intakeForm'
import { getClinicalProfileInsightSections } from '../../lib/clinicalProfile'

function InsightSection({ title, subtitle, items, category, onInsert, emptyText }) {
  if (!items?.length) {
    if (!emptyText) return null
    return (
      <div className="clinical-insights__section">
        <h4 className="clinical-insights__section-title">{title}</h4>
        <p className="text-muted text-small">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="clinical-insights__section">
      <h4 className="clinical-insights__section-title">{title}</h4>
      {subtitle && <p className="clinical-insights__section-subtitle text-small text-muted">{subtitle}</p>}
      <ul className="clinical-insights__list">
        {items.map(item => (
          <li key={item.id} className="clinical-insights__item">
            <div className="clinical-insights__item-body">
              <strong>{item.label}</strong>
              {item.detail && <span className="clinical-insights__detail">{item.detail}</span>}
              {item.severity && (
                <span className={`clinical-insights__severity clinical-insights__severity--${item.severity}`}>
                  {item.severity}
                </span>
              )}
            </div>
            {onInsert && (
              <button
                type="button"
                className="clinical-insights__insert"
                onClick={() => onInsert(formatInsertText(item, category))}
              >
                Insert
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ClinicalInsightsSidebar({ clientId, client, onInsert, embedded = false }) {
  const [open, setOpen] = useState(true)
  const intake = getIntakeForm(clientId)
  const profileSections = getClinicalProfileInsightSections(client?.clinical_profile)
  const isOpen = embedded || open
  const hasProfile = profileSections.length > 0
  const hasIntake = Boolean(intake)

  return (
    <section
      className={`clinical-insights${isOpen ? ' clinical-insights--open' : ''}${embedded ? ' clinical-insights--embedded' : ''}`}
      aria-label="Clinical insights"
    >
      {!embedded && (
        <button
          type="button"
          className="clinical-insights__toggle"
          onClick={() => setOpen(o => !o)}
          aria-expanded={isOpen}
        >
          <span className="clinical-insights__toggle-label">Clinical Insights</span>
          <span className="clinical-insights__toggle-hint">Profile & intake</span>
          <span className="clinical-insights__chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
        </button>
      )}

      {isOpen && (
        <div className="clinical-insights__body">
          {!hasProfile && !hasIntake ? (
            <p className="text-muted text-small">
              No clinical profile or intake on file. Edit the client profile to add themes, sensory tags, and goals — they will appear here for insert into notes.
            </p>
          ) : (
            <>
              {hasProfile && (
                <div className="clinical-insights__block">
                  <p className="clinical-insights__block-label">From clinical profile</p>
                  {profileSections.map(section => (
                    <InsightSection
                      key={section.key}
                      title={section.title}
                      items={section.items}
                      category="profile"
                      onInsert={onInsert}
                    />
                  ))}
                </div>
              )}

              {hasIntake && (
                <div className="clinical-insights__block">
                  <p className="clinical-insights__block-label">From creative care intake</p>
                  <InsightSection
                    title="Preferred modalities"
                    items={intake.preferred_modalities}
                    category="modality"
                    onInsert={onInsert}
                    emptyText="No modalities recorded."
                  />
                  <InsightSection
                    title="Sensory sensitivities"
                    items={intake.sensory_sensitivities}
                    category="sensitivity"
                    onInsert={onInsert}
                    emptyText="No sensitivities recorded."
                  />
                  <InsightSection
                    title="Core themes / metaphors"
                    items={intake.core_themes_metaphors}
                    category="theme"
                    onInsert={onInsert}
                    emptyText="No themes recorded."
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
