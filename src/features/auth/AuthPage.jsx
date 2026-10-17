import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthProvider'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'
import { loginDestination } from '../../lib/auth/loginDestination'
import DpaConsent from '../legal/DpaConsent'

export default function AuthPage() {
  const {
    configured,
    loading,
    user,
    signIn,
    signUp,
    recovery,
    requestPasswordReset,
    completePasswordReset,
  } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = loginDestination(params.get('next'))

  const [mode, setMode] = useState('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dpaAccepted, setDpaAccepted] = useState(false)

  if (!loading && user && !recovery) {
    return <Navigate to={next} replace />
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    if (mode === 'signup' && !dpaAccepted) {
      setBusy(false)
      setError('Accept the Data Processing Agreement to create an account.')
      return
    }

    const result = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, { fullName, dpaAccepted })

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

  const onForgot = async () => {
    setError(null)
    setInfo(null)
    const nextEmail = email.trim()
    if (!nextEmail) {
      setError('Enter the email you sign in with, then choose Forgot password.')
      document.getElementById('auth-email')?.focus()
      return
    }
    setBusy(true)
    const result = await requestPasswordReset(nextEmail)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setInfo('If that email has an account, a reset link is on its way. Open it on this same site.')
  }

  const onChoosePassword = async (event) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    const result = await completePasswordReset(password)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate(next, { replace: true })
  }

  const title = recovery
    ? 'Choose a new password'
    : mode === 'signin'
      ? 'Sign in to your practice'
      : 'Create your practice account'

  return (
    <div className="auth-page">
      <div className={`auth-page__card${mode === 'signup' && !recovery ? ' auth-page__card--wide' : ''}`}>
        <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
        <h1 className="auth-page__title">{title}</h1>

        {!configured && (
          <p className="auth-page__alert" role="alert">
            Supabase env vars are missing. Set <code>VITE_SUPABASE_URL</code> and
            {' '}<code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
          </p>
        )}

        {recovery ? (
          <form className="auth-page__form" onSubmit={onChoosePassword}>
            <label className="auth-page__field">
              <span>New password</span>
              <input
                className="paper-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="auth-page__field">
              <span>Confirm password</span>
              <input
                className="paper-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error && <p className="auth-page__alert" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary auth-page__submit" disabled={busy || !configured || loading}>
              {busy ? 'Please wait…' : 'Save password'}
            </button>
          </form>
        ) : (
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
              id="auth-email"
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

          {mode === 'signup' && (
            <DpaConsent checked={dpaAccepted} onChange={setDpaAccepted} />
          )}

          {error && <p className="auth-page__alert" role="alert">{error}</p>}
          {info && <p className="auth-page__info">{info}</p>}

          <button
            type="submit"
            className="btn btn-primary auth-page__submit"
            disabled={busy || !configured || loading || (mode === 'signup' && !dpaAccepted)}
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          {mode === 'signin' && (
            <button type="button" className="auth-page__forgot" onClick={onForgot} disabled={busy || !configured}>
              Forgot password
            </button>
          )}
        </form>
        )}

        {!recovery && (
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
        )}
      </div>
    </div>
  )
}
