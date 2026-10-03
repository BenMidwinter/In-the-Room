export default function PageHeader({
  title,
  subtitle,
  actions,
  toolbar,
  className = '',
  /** When false, skip negative horizontal margins (e.g. `page--service-lead` has no inline padding). */
  bleed = true,
}) {
  const withToolbar = Boolean(toolbar)

  return (
    <header
      className={[
        'page-header',
        withToolbar ? 'page-header--with-toolbar' : '',
        bleed ? '' : 'page-header--service-lead',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
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
