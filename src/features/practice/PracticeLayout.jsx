import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const linkClass = ({ isActive }) =>
  `client-nav-bar__link${isActive ? ' client-nav-bar__link--active' : ''}`

const SECTIONS = [
  { to: '/practice/documents', label: 'My Documents' },
  { to: '/practice/journal', label: 'Journal' },
  { to: '/practice/cpd', label: 'CPD log' },
  { to: '/practice/supervision', label: 'Supervision log' },
]

export default function PracticeLayout() {
  const location = useLocation()
  const [editorOpen, setEditorOpen] = useState(false)
  const [seenPath, setSeenPath] = useState(location.pathname)
  if (location.pathname !== seenPath) {
    setSeenPath(location.pathname)
    setEditorOpen(false)
  }

  return (
    <div className="page page--practice">
      <header className="client-shell__header">
        <div className="client-shell__identity">
          <h1>My Practice</h1>
        </div>
      </header>

      {!editorOpen && (
        <nav className="client-nav-bar" aria-label="Practice sections">
          <ul className="client-nav-bar__list">
            {SECTIONS.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} className={linkClass}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="client-layout">
        <div className="client-layout__main">
          <Outlet context={{ setEditorOpen }} />
        </div>
      </div>
    </div>
  )
}
