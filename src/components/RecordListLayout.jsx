import HelpTip from './HelpTip'

/**
 * Consistent shell for list-first modules.
 * `embedded`: no page title — slim toolbar only (used under Documents subnav).
 */
export default function RecordListLayout({
  title,
  subtitle,
  newLabel,
  onNew,
  headerActions,
  toolbar,
  children,
  editor,
  className = '',
  embedded = false,
}) {
  const showNew = Boolean(newLabel && onNew)
  const actions = (
    <>
      {headerActions}
      {showNew && (
        <button type="button" className="primary" onClick={onNew}>
          + New {newLabel}
        </button>
      )}
    </>
  )

  return (
    <div className={`flex min-w-0 flex-col gap-0 ${className}`.trim()}>
      {!embedded && (title || subtitle || headerActions || showNew) && (
        <header className="mb-0 flex flex-wrap items-start justify-between gap-3 border-b border-line-light pb-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {title ? <h2 className="m-0 text-lg font-bold leading-tight text-accent">{title}</h2> : <span />}
            {subtitle ? <HelpTip text={subtitle} label={`About ${title || 'this list'}`} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}

      {(toolbar || embedded) && (
        <div className="record-list-toolbar">
          <div className="record-list-toolbar__start">{toolbar}</div>
          {embedded && (
            <div className="record-list-toolbar__actions">{actions}</div>
          )}
        </div>
      )}

      <div className="pt-4">{children}</div>

      {editor && (
        <div className="mt-5 border-t border-line-light pt-5">{editor}</div>
      )}
    </div>
  )
}
