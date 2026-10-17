import { useState } from 'react'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'
import { useAuth } from '../../lib/auth/AuthProvider'
import DpaConsent from './DpaConsent'

export default function DpaSignOff() {
  const { acceptDpa, signOut, profile } = useAuth()
  const renewing = Boolean(profile?.dpa_accepted)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!accepted) {
      setError('Accept the Data Processing Agreement to continue.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await acceptDpa()
    setBusy(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card auth-page__card--wide">
        <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
        <h1 className="auth-page__title">Data Processing Agreement</h1>
        <p className="auth-page__lead">
          {renewing
            ? 'The agreement is now version 1.1. Your earlier acceptance stays on record. Accept this version to continue.'
            : 'Accept the agreement to continue. It takes effect on this sign-off.'}
        </p>
        <form className="auth-page__form" onSubmit={onSubmit}>
          <DpaConsent checked={accepted} onChange={setAccepted} id="dpa-signoff" />
          {error && <p className="auth-page__alert" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary auth-page__submit" disabled={busy || !accepted}>
            {busy ? 'Please wait…' : 'Accept and continue'}
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
