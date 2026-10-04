import { useEffect, useState, useMemo } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useStoreRefreshers } from '../lib/queries'
import ThemeToggle from './ThemeToggle'
import { RouteErrorBoundary } from './ErrorBoundary'
import { AppSessionProvider } from '../lib/AppSessionContext'
import { AppointmentOverlayProvider } from '../features/appointments/AppointmentOverlay'
import { useAuth } from '../lib/auth/AuthProvider'
import RequireAuth from './RequireAuth'

const NAV_ITEMS = [
  { to: '/home', label: 'Home', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/clients', label: 'All Clients' },
  { to: '/practice', label: 'My Practice' },
  { to: '/finance', label: '[Finance]' },
  { to: '/reporting', label: '[Reporting]' },
]

function GearIcon() {
  return (
    <svg className="top-nav__utility-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.6.22l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.23.09.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  )
}

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
    },
  }), [user, displayName])

  const activePersona = useMemo(() => ({
    id: user.id,
    userId: user.id,
    name: displayName,
  }), [user.id, displayName])

  const appSession = useMemo(() => ({
    session,
    activePersona,
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
                <button
                  type="button"
                  className="top-nav__utility-btn"
                  onClick={() => navigate('/settings/account')}
                  aria-label="Settings"
                  title="Settings"
                >
                  <GearIcon />
                </button>
              </div>
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
            <AppointmentOverlayProvider>
              <Outlet />
            </AppointmentOverlayProvider>
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
