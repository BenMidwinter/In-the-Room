import { ROLE_BLOCK_META, PROFILE_BLOCK_META } from '../lib/roleBlocks'
import { ORG_BLOCK_META } from '../lib/orgBlocks'

const BLOCK_META = { ...ROLE_BLOCK_META, ...PROFILE_BLOCK_META, ...ORG_BLOCK_META }

/**
 * Modular section chrome.
 * - `actions`: header-right controls
 * - `toolbar`: strip above the body (lists, + New, filters)
 */
export default function RoleBlockShell({
  blockId,
  title,
  description,
  children,
  actions,
  toolbar,
}) {
  const meta = BLOCK_META[blockId] || {}
  const heading = title ?? meta.title

  return (
    <section className={`role-block role-block--${blockId}`} aria-labelledby={`role-block-${blockId}`}>
      <header className="role-block__header">
        <div className="role-block__heading">
          <h2 id={`role-block-${blockId}`} className="role-block__title">
            {heading}
          </h2>
          {(description || meta.description) && (
            <p className="role-block__desc">{description || meta.description}</p>
          )}
        </div>
        {actions && <div className="role-block__actions">{actions}</div>}
      </header>
      {toolbar && (
        <div className="role-block__toolbar" role="toolbar" aria-label={`${heading} tools`}>
          {toolbar}
        </div>
      )}
      <div className="role-block__body">{children}</div>
    </section>
  )
}
