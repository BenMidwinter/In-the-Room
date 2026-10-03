import { useState } from 'react'
import RoleBlockShell from '../../components/RoleBlockShell'
import { getSupabase } from '../../lib/supabase/client'

export function SettingsSectionCard({ blockId, title, children }) {
  return (
    <RoleBlockShell blockId={blockId} title={title}>
      <div className="role-block__panel">
        {children}
      </div>
    </RoleBlockShell>
  )
}

export function FormsSettingsPage() {
  return (
    <div className="role-block-stack">
      <SettingsSectionCard blockId="settings_forms" title="Forms">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Clinician-designed forms (intake/onboarding that can create clients, plus information-gathering)
          are the next larger build alongside Rich Text Editor improvements.
        </p>
        <ul className="settings-roadmap">
          <li>Form builder with field schema stored on <code>form_definitions</code></li>
          <li>Shareable / embeddable submission links</li>
          <li>Onboarding submissions that create a client + timeline event</li>
          <li>RTE polish for progress notes, letters, reports, and working documents</li>
        </ul>
        <p className="text-small text-muted" style={{ marginBottom: 0 }}>
          Tracked as next major workstream — not stubbed further until Account, Services, and Google sync are solid.
        </p>
      </SettingsSectionCard>
    </div>
  )
}

export function TemplateKindPage({ kind, title, blurb }) {
  return (
    <div className="role-block-stack">
      <SettingsSectionCard blockId={`settings_templates_${kind}`} title={title}>
        <p className="text-muted" style={{ marginTop: 0 }}>{blurb}</p>
        <p className="text-small text-muted" style={{ marginBottom: 0 }}>
          Templates persist to <code>templates</code> (<code>kind = {kind}</code>). Editor UX ships with the RTE workstream.
        </p>
      </SettingsSectionCard>
    </div>
  )
}

export function PasswordSettingsPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setMessage(null)
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setPassword('')
    setConfirm('')
    setMessage('Password updated.')
  }

  return (
    <div className="role-block-stack">
      <SettingsSectionCard blockId="settings_password" title="Password">
        <form className="settings-form" onSubmit={onSubmit}>
          <label className="settings-form__field">
            <span>New password</span>
            <input
              className="paper-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="settings-form__field">
            <span>Confirm password</span>
            <input
              className="paper-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="auth-page__alert" role="alert">{error}</p>}
          {message && <p className="auth-page__info">{message}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </SettingsSectionCard>
    </div>
  )
}

export function TwoFactorSettingsPage() {
  return (
    <div className="role-block-stack">
      <SettingsSectionCard blockId="settings_2fa" title="Two-factor authentication">
        <p className="text-muted" style={{ marginTop: 0 }}>
          TOTP-based 2FA via Supabase Auth MFA will live here. Enrollment UI follows once Google connect is testable.
        </p>
      </SettingsSectionCard>
    </div>
  )
}
