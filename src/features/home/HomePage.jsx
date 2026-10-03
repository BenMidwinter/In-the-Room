import { useAppSession } from '../../lib/AppSessionContext'
import PageHeader from '../../components/PageHeader'
import { Link } from 'react-router-dom'

export default function HomePage() {
  const { activePersona } = useAppSession()
  const name = activePersona?.name && activePersona.name !== 'Clinician'
    ? activePersona.name
    : null

  return (
    <div className="page page--home">
      <PageHeader title={name ? `Welcome back, ${name}` : 'Welcome'} />
      <div className="role-block-stack">
        <section className="role-block">
          <header className="role-block__header">
            <h2 className="role-block__title">Your practice</h2>
          </header>
          <div className="role-block__panel">
            <p className="text-muted" style={{ margin: '0 0 1rem' }}>
              No clients or sessions yet. Start by adding a client — clinical notes stay encrypted on your device before they ever reach storage.
            </p>
            <div className="role-block__actions">
              <Link to="/clients/add" className="btn btn-primary">Add client</Link>
              <Link to="/calendar" className="btn btn-secondary">Open calendar</Link>
              <Link to="/profile" className="btn btn-secondary">Edit profile</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
