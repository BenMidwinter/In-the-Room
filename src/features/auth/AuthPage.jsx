import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthProvider'

export default function AuthPage() {
  const { configured, loading, user, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/home'

  const [mode, setMode] = useState('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    return <Navigate to={next} replace />
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    const result = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, fullName)

    setBusy(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (mode === 'signup') {
      setInfo('Account created. If email confirmation is enabled, check your inbox before signing in.')
      setMode('signin')
      return
    }

    navigate(next, { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <p className="auth-page__brand">In the Room</p>
        <h1 className="auth-page__title">
          {mode === 'signin' ? 'Sign in to your practice' : 'Create your practice account'}
        </h1>
        <p className="auth-page__lead">
          Freelance clinical workspace — encrypted notes, calendar, and caseload in one place.
        </p>

        {!configured && (
          <p className="auth-page__alert" role="alert">
            Supabase env vars are missing. Set <code>VITE_SUPABASE_URL</code> and
            {' '}<code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
          </p>
        )}

        <form className="auth-page__form" onSubmit={onSubmit}>
          {mode === 'signup' && (
            <label className="auth-page__field">
              <span>Full name</span>
              <input
                className="paper-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}
          <label className="auth-page__field">
            <span>Email</span>
            <input
              className="paper-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-page__field">
            <span>Password</span>
            <input
              className="paper-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>

          {error && <p className="auth-page__alert" role="alert">{error}</p>}
          {info && <p className="auth-page__info">{info}</p>}

          <button type="submit" className="btn btn-primary auth-page__submit" disabled={busy || !configured || loading}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-page__switch">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" className="auth-page__link" onClick={() => { setMode('signup'); setError(null) }}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="auth-page__link" onClick={() => { setMode('signin'); setError(null) }}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
