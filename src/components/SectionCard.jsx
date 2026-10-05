import { ROLE_BLOCK_META, PROFILE_BLOCK_META } from '../lib/roleBlocks'
import HelpTip from './HelpTip'

const BLOCK_META = { ...ROLE_BLOCK_META, ...PROFILE_BLOCK_META }

/**
 * Section chrome for practice pages.
 * - `actions`: header-right controls
 * - `toolbar`: strip above the body (lists, + New, filters)
 */
export default function SectionCard({
  blockId,
  title,
  description,
  children,
  actions,
  toolbar,
}) {
  const meta = BLOCK_META[blockId] || {}
  const heading = title ?? meta.title
  const helpText = description || meta.description || ''

  return (
    <section className={`section-card section-card--${blockId}`} aria-labelledby={`section-card-${blockId}`}>
      <header className="section-card__header">
        <div className="section-card__heading">
          <div className="section-card__title-row">
            <h2 id={`section-card-${blockId}`} className="section-card__title">
              {heading}
            </h2>
            {helpText ? <HelpTip text={helpText} label={`About ${heading}`} /> : null}
          </div>
        </div>
        {actions && <div className="section-card__actions">{actions}</div>}
      </header>
      {toolbar && (
        <div className="section-card__toolbar" role="toolbar" aria-label={`${heading} tools`}>
          {toolbar}
        </div>
      )}
      <div className="section-card__body">{children}</div>
    </section>
  )
}
