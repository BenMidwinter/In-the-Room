import { useCallback, useEffect, useState } from 'react'
import SectionCard from '../../components/SectionCard'
import { confirmCurrentPassword } from '../../lib/auth/confirmPassword'
import { getSupabase } from '../../lib/supabase/client'

function qrSrc(code) {
  if (!code) return ''
  if (code.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`
  return code
}

export default function TwoFactorSettingsPage() {
  const [factors, setFactors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [enrolment, setEnrolment] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [removingId, setRemovingId] = useState(null)

  const load = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) {
      setError('Supabase is not configured')
      setLoading(false)
      return
    }
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      setError(listError.message)
      setFactors([])
    } else {
      setError('')
      setFactors(data?.totp || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const verified = factors.filter((factor) => factor.status === 'verified')

  const startEnrol = async () => {
    const supabase = getSupabase()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      for (const factor of factors.filter((item) => item.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      })
      if (enrolError || !data?.id || !data.totp) throw new Error(enrolError?.message || 'Enrolment could not start.')
      setEnrolment({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      })
      setCode('')
      await load()
    } catch (err) {
      setError(err?.message || 'Enrolment could not start.')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnrol = async (event) => {
    event.preventDefault()
    const supabase = getSupabase()
    if (!supabase || !enrolment) return
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) {
      setError('Enter the six-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError('')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolment.id,
      code: digits,
    })
    setBusy(false)
    if (verifyError) {
      setError(verifyError.message)
      return
    }
    setEnrolment(null)
    setCode('')
    await load()
  }

  const cancelEnrol = async () => {
    const supabase = getSupabase()
    if (supabase && enrolment) await supabase.auth.mfa.unenroll({ factorId: enrolment.id })
    setEnrolment(null)
    setCode('')
    await load()
  }

  const removeFactor = async (event) => {
    event.preventDefault()
    const supabase = getSupabase()
    if (!supabase || !removingId) return
    setBusy(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await confirmCurrentPassword(password)
      if (session?.access_token && session.refresh_token) {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        if (restoreError) throw new Error(restoreError.message)
      }
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: removingId })
      if (removeError) throw new Error(removeError.message)
      setRemovingId(null)
      setPassword('')
      await load()
    } catch (err) {
      setError(err?.message || 'The authenticator could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section-card-stack">
      <SectionCard
        blockId="settings_2fa"
        title="Two-factor authentication"
        description="An authenticator app adds a six-digit code after your password."
      >
        <div className="section-card__panel">
          {loading && <p className="text-muted">Loading authenticators…</p>}
          {!loading && verified.length > 0 && (
            <ul className="totp-factors">
              {verified.map((factor) => (
                <li key={factor.id} className="totp-factors__row">
                  <span>{factor.friendly_name || 'Authenticator app'}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setRemovingId(factor.id)
                      setPassword('')
                      setError('')
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && verified.length === 0 && !enrolment && (
            <p className="text-muted" style={{ marginTop: 0 }}>
              No authenticator is enrolled. Clinical pages stay available until you add one. After that, each sign-in asks for a code.
            </p>
          )}
          {removingId && (
            <form className="settings-form" onSubmit={removeFactor}>
              <label className="settings-form__field" htmlFor="totp-remove-password">
                <span>Password</span>
                <input
                  id="totp-remove-password"
                  className="paper-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <p className="settings-form__hint">Enter your sign-in password to remove this authenticator.</p>
              </label>
              <div className="settings-form__actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>Remove authenticator</button>
                <button type="button" className="btn btn-secondary" onClick={() => setRemovingId(null)}>Cancel</button>
              </div>
            </form>
          )}
          {!enrolment && !removingId && (
            <div className="settings-form__actions">
              <button type="button" className="btn btn-primary" onClick={startEnrol} disabled={busy || loading}>
                {verified.length ? 'Add another authenticator' : 'Enrol authenticator'}
              </button>
            </div>
          )}
          {enrolment && (
            <form className="settings-form" onSubmit={confirmEnrol}>
              <p className="settings-form__hint">
                Scan this code with Google Authenticator, 1Password, or Apple Passwords. You can also type the secret.
              </p>
              {enrolment.qr && (
                <img className="totp-qr" src={qrSrc(enrolment.qr)} alt="Authenticator QR code" width="180" height="180" />
              )}
              {enrolment.secret && <p className="totp-secret">{enrolment.secret}</p>}
              <label className="settings-form__field" htmlFor="totp-confirm-code">
                <span>Code</span>
                <input
                  id="totp-confirm-code"
                  className="paper-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </label>
              <div className="settings-form__actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>Confirm code</button>
                <button type="button" className="btn btn-secondary" onClick={cancelEnrol} disabled={busy}>Cancel</button>
              </div>
            </form>
          )}
          {error && <p className="auth-page__alert" role="alert">{error}</p>}
        </div>
      </SectionCard>
    </div>
  )
}
