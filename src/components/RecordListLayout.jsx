/**
 * Consistent shell for list-first client modules (appointments, notes, letters, etc.).
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
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0 ${className}`.trim()}>
      <header className="mb-0 flex flex-wrap items-start justify-between gap-3 border-b border-line-light pb-4">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-bold leading-tight text-accent">{title}</h2>
          {subtitle && (
            <p className="mt-1.5 mb-0 max-w-[36rem] text-sm leading-normal text-subtle">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          {newLabel && onNew && (
            <button type="button" className="primary" onClick={onNew}>
              + New {newLabel}
            </button>
          )}
        </div>
      </header>

      {toolbar && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-line-light py-3.5">
          {toolbar}
        </div>
      )}

      <div className="pt-0">{children}</div>

      {editor && (
        <div className="mt-5 border-t border-line-light pt-5">{editor}</div>
      )}
    </div>
  )
}
