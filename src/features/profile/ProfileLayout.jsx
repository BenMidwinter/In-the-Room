import { NavLink, Outlet } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'

export default function ProfileLayout() {
  return (
    <div className="page page--profile">
      <PageHeader
        title="Profile"
        toolbar={(
          <nav className="profile-actions profile-actions--inline" aria-label="Profile sections">
            <NavLink to="/profile" end className="profile-actions__link">
              Clinician details
            </NavLink>
            <NavLink to="/profile/journal" className="profile-actions__link">
              Journal
            </NavLink>
          </nav>
        )}
      />
      <Outlet />
    </div>
  )
}
