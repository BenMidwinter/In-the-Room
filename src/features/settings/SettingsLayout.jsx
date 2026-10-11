import { Outlet, useLocation } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import SectionNav from '../../components/SectionNav'

const PRIMARY_TABS = [
  { to: '/settings/account', label: 'Account settings', end: true },
  { to: '/settings/availability', label: 'Availability' },
  { to: '/settings/services', label: 'Services' },
  { to: '/settings/templates', label: 'Templates' },
  { to: '/settings/forms', label: 'Forms' },
  { to: '/settings/tags', label: 'Tags' },
  { to: '/settings/2fa', label: '[2FA]' },
  { to: '/settings/integrations', label: 'Integrations' },
]

const TEMPLATE_TABS = [
  { to: '/settings/templates/progress-notes', label: 'Process Notes' },
  { to: '/settings/templates/letters', label: 'Letters' },
  { to: '/settings/templates/reports', label: 'Reports' },
  { to: '/settings/templates/working-documents', label: 'Working documents' },
]

export default function SettingsLayout() {
  const { pathname } = useLocation()
  const onTemplates = pathname.startsWith('/settings/templates')

  return (
    <div className="page page--settings">
      <div className="page-mast">
        <PageHeader title="Settings" />
        <SectionNav label="Settings" items={PRIMARY_TABS} />
        {onTemplates && <SectionNav label="Template types" items={TEMPLATE_TABS} />}
      </div>
      <div className="settings-panel">
        <Outlet />
      </div>
    </div>
  )
}
