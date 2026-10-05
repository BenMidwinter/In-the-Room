import HelpTip from './HelpTip'

export default function PageHeader({
  title,
  help,
  actions,
  toolbar,
  className = '',
  /** When false, skip negative horizontal margins. */
  bleed = true,
}) {
  const withToolbar = Boolean(toolbar)

  return (
    <header
      className={[
        'page-header',
        withToolbar ? 'page-header--with-toolbar' : '',
        bleed ? '' : 'page-header--flush',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="page-header__text">
        <div className="page-header__title-row">
          <h1 className="page-header__title">{title}</h1>
          {help ? <HelpTip text={help} label={`About ${title}`} /> : null}
        </div>
      </div>
      {toolbar && <div className="page-header__toolbar">{toolbar}</div>}
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

/** Compact filter control for page header toolbars. */
export function PageHeaderFilter({ id, label, children, className = '' }) {
  return (
    <div className={`page-header__filter ${className}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      {children}
    </div>
  )
}
