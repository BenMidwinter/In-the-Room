import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'

const PRIMARY_TABS = [
  { to: '/settings/account', label: 'Account settings', end: true },
  { to: '/settings/availability', label: 'Availability' },
  { to: '/settings/services', label: 'Services' },
  { to: '/settings/templates', label: 'Templates' },
  { to: '/settings/forms', label: 'Forms' },
  { to: '/settings/password', label: 'Password' },
  { to: '/settings/2fa', label: '2FA' },
  { to: '/settings/integrations', label: 'Integrations' },
]

const TEMPLATE_TABS = [
  { to: '/settings/templates/progress-notes', label: 'Progress notes' },
  { to: '/settings/templates/letters', label: 'Letters' },
  { to: '/settings/templates/reports', label: 'Reports' },
  { to: '/settings/templates/working-documents', label: 'Working documents' },
]

export default function SettingsLayout() {
  const { pathname } = useLocation()
  const onTemplates = pathname.startsWith('/settings/templates')

  return (
    <div className="page page--settings">
      <PageHeader
        title="Settings"
        subtitle="Practice account, services, templates, and integrations."
      />
      <nav className="settings-tabs" aria-label="Settings">
        {PRIMARY_TABS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => {
              const active = isActive || (to === '/settings/templates' && onTemplates)
              return `settings-tabs__link${active ? ' settings-tabs__link--active' : ''}`
            }}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      {onTemplates && (
        <nav className="settings-subtabs" aria-label="Template types">
          {TEMPLATE_TABS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `settings-subtabs__link${isActive ? ' settings-subtabs__link--active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="settings-panel">
        <Outlet />
      </div>
    </div>
  )
}
