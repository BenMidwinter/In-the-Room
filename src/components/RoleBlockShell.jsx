import { ROLE_BLOCK_META, PROFILE_BLOCK_META } from '../lib/roleBlocks'
import { ORG_BLOCK_META } from '../lib/orgBlocks'

const BLOCK_META = { ...ROLE_BLOCK_META, ...PROFILE_BLOCK_META, ...ORG_BLOCK_META }

export default function RoleBlockShell({ blockId, title, description, children, actions }) {
  const meta = BLOCK_META[blockId] || {}
  const heading = title ?? meta.title

  return (
    <section className={`role-block role-block--${blockId}`} aria-labelledby={`role-block-${blockId}`}>
      <header className="role-block__header">
        <div className="role-block__heading">
          <span className="role-block__badge">{meta.label || blockId}</span>
          <h2 id={`role-block-${blockId}`} className="role-block__title">
            {heading}
          </h2>
          {(description || meta.description) && (
            <p className="role-block__desc">{description || meta.description}</p>
          )}
        </div>
        {actions && <div className="role-block__actions">{actions}</div>}
      </header>
      <div className="role-block__body">{children}</div>
    </section>
  )
}
