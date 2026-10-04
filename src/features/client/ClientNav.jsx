import { NavLink } from 'react-router-dom'
import { useAppSession } from '../../lib/AppSessionContext'
import { canAccessClientNavSection } from '../../lib/permissions'

const NAV_ITEMS = [
  { segment: '', label: 'Overview', end: true, section: 'overview' },
  { segment: 'case-history', label: 'Course', section: 'case-history' },
  { segment: 'appointments', label: 'Appointments', section: 'appointments' },
  { segment: 'notes-history', label: 'Process Notes', section: 'notes-history' },
  { segment: 'documents', label: 'Documents', section: 'documents' },
  { segment: 'files', label: 'Files', section: 'files' },
  { segment: 'contacts', label: 'Contacts', section: 'contacts' },
]

const linkClass = ({ isActive }) =>
  `client-nav-bar__link${isActive ? ' client-nav-bar__link--active' : ''}`

export default function ClientNav({ clientId, client }) {
  const base = `/clients/${clientId}`
  const { session } = useAppSession()
  const userId = session?.user?.id

  const items = NAV_ITEMS.filter((item) => {
    if (item.section === 'overview') return true
    return canAccessClientNavSection(item.section, null, client, userId)
  })

  return (
    <nav className="client-nav-bar" aria-label="Client sections">
      <ul className="client-nav-bar__list">
        {items.map(({ segment, label, end }) => (
          <li key={segment || 'overview'}>
            <NavLink to={segment ? `${base}/${segment}` : base} end={end} className={linkClass}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
