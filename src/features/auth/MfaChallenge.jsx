import { useState } from 'react'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'
import { useAuth } from '../../lib/auth/AuthProvider'
import TotpCodeInput from './TotpCodeInput'

export default function MfaChallenge() {
  const { verifyTotp, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  const onComplete = async (code) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await verifyTotp(code)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      setAttempt((value) => value + 1)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
        <h1 className="auth-page__title">Authenticator code</h1>
        <p className="auth-page__lead">
          This account has an authenticator app. Enter the current six-digit code to continue.
        </p>
        <div className="auth-page__form">
          <TotpCodeInput key={attempt} onComplete={onComplete} disabled={busy} />
          {busy && <p className="text-muted">Checking…</p>}
          {error && <p className="auth-page__alert" role="alert">{error}</p>}
        </div>
        <p className="auth-page__switch">
          <button type="button" className="auth-page__link" onClick={() => signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  )
}
