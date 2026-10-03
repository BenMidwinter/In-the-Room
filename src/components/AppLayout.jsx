import { useEffect, useState, useMemo } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useStoreRefreshers } from '../lib/queries'
import { ROLES } from '../lib/permissions'
import ThemeToggle from './ThemeToggle'
import { RouteErrorBoundary } from './ErrorBoundary'
import { AppSessionProvider } from '../lib/AppSessionContext'
import { useAuth } from '../lib/auth/AuthProvider'
import RequireAuth from './RequireAuth'

const NAV_ITEMS = [
  { to: '/home', label: 'Home', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/active-cases', label: 'Active Cases' },
  { to: '/clients', label: 'All Clients' },
  { to: '/finance', label: 'Finance' },
  { to: '/reporting', label: 'Reporting' },
  { to: '/lab/progress-note', label: 'Note lab' },
]

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, signOut, refreshProfile } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const { refreshClients, refreshMemberships } = useStoreRefreshers()

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const displayName = profile?.display_name
    || user?.user_metadata?.full_name
    || user?.email
    || 'Clinician'

  const session = useMemo(() => ({
    user: {
      id: user.id,
      email: user.email,
      name: displayName,
      full_name: displayName,
      isAdmin: false,
      isServiceLead: false,
    },
  }), [user, displayName])

  const activePersona = useMemo(() => ({
    id: 'clinician',
    userId: user.id,
    name: displayName,
    role: ROLES.CLINICIAN,
  }), [user.id, displayName])

  const appSession = useMemo(() => ({
    session,
    activePersona,
    personaId: 'clinician',
    demoRole: ROLES.CLINICIAN,
    myWorkplace: null,
    myWorkplaces: [],
    activeWorkplaceId: null,
    setActiveWorkplaceId: () => {},
    refreshClients: () => {
      refreshClients()
      refreshProfile()
    },
    refreshMemberships,
  }), [
    session,
    activePersona,
    refreshClients,
    refreshMemberships,
    refreshProfile,
  ])

  const isProgressNotes = location.pathname.includes('/progress-notes')

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

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
              <button
                type="button"
                className="top-nav__profile-btn"
                onClick={handleSignOut}
              >
                Sign out
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

export default function AppLayout() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  )
}
