import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthProvider'
import { loginDestination } from '../lib/auth/loginDestination'
import { brandLogoUrl, PRODUCT_NAME } from '../lib/brand'
import DpaSignOff from '../features/legal/DpaSignOff'
import MfaChallenge from '../features/auth/MfaChallenge'

export default function RequireAuth({ children }) {
  const { configured, loading, user, profileReady, dpaCurrent, mfaReady, needsMfa } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
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
          <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
          <p className="auth-page__lead">Checking your session…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    const next = loginDestination(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  if (!profileReady) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
          <p className="auth-page__lead">Checking your session…</p>
        </div>
      </div>
    )
  }

  if (!dpaCurrent) {
    return <DpaSignOff />
  }

  if (!mfaReady) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
          <p className="auth-page__lead">Checking your session…</p>
        </div>
      </div>
    )
  }

  if (needsMfa) {
    return <MfaChallenge />
  }

  return children
}
