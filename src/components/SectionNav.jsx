import { NavLink } from 'react-router-dom'

const linkClass = (active) =>
  `client-nav-bar__link${active ? ' client-nav-bar__link--active' : ''}`

export default function SectionNav({ label, items, className = '' }) {
  return (
    <nav className={`client-nav-bar${className ? ` ${className}` : ''}`.trim()} aria-label={label}>
      <ul className="client-nav-bar__list">
        {items.map((item) => (
          <li key={item.key || item.to || item.label}>
            {item.to ? (
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => linkClass(isActive)}
              >
                {item.label}
              </NavLink>
            ) : (
              <button
                type="button"
                className={linkClass(item.active)}
                aria-current={item.active ? 'page' : undefined}
                onClick={item.onSelect}
              >
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
