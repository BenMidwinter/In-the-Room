import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthProvider'

export default function RequireAuth({ children }) {
  const { configured, loading, user } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <p className="auth-page__brand">In the Room</p>
          <h1 className="auth-page__title">Configuration needed</h1>
          <p className="auth-page__lead">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to connect auth.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <p className="auth-page__brand">In the Room</p>
          <p className="auth-page__lead">Checking your session…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return children
}
