import { useState } from 'react'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'
import { useAuth } from '../../lib/auth/AuthProvider'

export default function MfaChallenge() {
  const { verifyTotp, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await verifyTotp(code)
    setBusy(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
        <h1 className="auth-page__title">Authenticator code</h1>
        <p className="auth-page__lead">
          This account has an authenticator app. Enter the current six-digit code to continue.
        </p>
        <form className="auth-page__form" onSubmit={onSubmit}>
          <label className="auth-page__field" htmlFor="mfa-code">
            Code
            <input
              id="mfa-code"
              className="paper-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          {error && <p className="auth-page__alert" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary auth-page__submit" disabled={busy}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
        <p className="auth-page__switch">
          <button type="button" className="auth-page__link" onClick={() => signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  )
}
