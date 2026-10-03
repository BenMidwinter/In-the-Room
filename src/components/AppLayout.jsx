import { useEffect, useState, useMemo } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { CLINICIAN_PROFILES, CURRENT_USER } from '../lib/mockData'
import { useStoreRefreshers } from '../lib/queries'
import { ROLES } from '../lib/permissions'
import { DEFAULT_PERSONA_ID, getPersonaById } from '../lib/demoPersonas'
import ThemeToggle from './ThemeToggle'
import { RouteErrorBoundary } from './ErrorBoundary'
import { AppSessionProvider } from '../lib/AppSessionContext'

const NAV_ITEMS = [
  { to: '/home', label: 'Home', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/active-cases', label: 'Active Cases' },
  { to: '/clients', label: 'All Clients' },
  { to: '/finance', label: 'Finance' },
  { to: '/reporting', label: 'Reporting' },
  { to: '/lab/progress-note', label: 'Note lab' },
]

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const personaId = DEFAULT_PERSONA_ID
  const activePersona = useMemo(() => getPersonaById(personaId), [personaId])
  const demoRole = ROLES.CLINICIAN

  const session = useMemo(() => {
    const profile = CLINICIAN_PROFILES.find(p => p.id === activePersona.userId)
    return {
      user: {
        id: activePersona.userId || CURRENT_USER.id,
        email: CURRENT_USER.email,
        name: activePersona.name,
        full_name: profile?.full_name || activePersona.name,
        isAdmin: false,
        isServiceLead: false,
      },
    }
  }, [activePersona])

  const [menuOpen, setMenuOpen] = useState(false)
  const { refreshClients, refreshMemberships } = useStoreRefreshers()

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const isProgressNotes = location.pathname.includes('/progress-notes')

  const appSession = useMemo(() => ({
    session,
    activePersona,
    personaId,
    demoRole,
    myWorkplace: null,
    myWorkplaces: [],
    activeWorkplaceId: null,
    setActiveWorkplaceId: () => {},
    refreshClients,
    refreshMemberships,
  }), [
    session,
    activePersona,
    personaId,
    demoRole,
    refreshClients,
    refreshMemberships,
  ])

  return (
    <div className={`app-shell${menuOpen ? ' app-shell--nav-open' : ''}`}>
      <header className={`top-nav${menuOpen ? ' top-nav--open' : ''}`}>
        <div className="top-nav__inner">
          <div className="top-nav__brand-row">
            <NavLink to="/home" className="top-nav__brand">
              <span className="top-nav__brand-text">
                <span className="top-nav__brand-name">In the Room</span>
              </span>
            </NavLink>
            <button
              type="button"
              className="top-nav__menu-btn"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>

          <nav className="top-nav__links" aria-label="Primary">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="top-nav__actions">
            <div className="top-nav__utilities">
              <div className="top-nav__utilities-row">
                <ThemeToggle />
              </div>
              <button
                type="button"
                className="top-nav__profile-btn"
                onClick={() => navigate('/profile')}
                aria-label="Profile"
              >
                Profile
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <button
          type="button"
          className="top-nav__backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main className={`main-content${isProgressNotes ? ' main-content--progress-notes' : ''}`}>
        <div className="top-nav__mobile-bar">
          <NavLink to="/home" className="top-nav__brand top-nav__brand--compact">
            <span className="top-nav__brand-text">
              <span className="top-nav__brand-name">In the Room</span>
            </span>
          </NavLink>
          <button
            type="button"
            className="top-nav__menu-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
        <RouteErrorBoundary>
          <AppSessionProvider value={appSession}>
            <Outlet />
          </AppSessionProvider>
        </RouteErrorBoundary>
      </main>
    </div>
  )
}
