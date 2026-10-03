import { useEffect, useState } from 'react'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { getSupabase } from '../../lib/supabase/client'
import { useToast } from '../../components/ui'

export default function LoginSettingsPage() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busyEmail, setBusyEmail] = useState(false)
  const [busyPassword, setBusyPassword] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email || '')
    })
  }, [])

  const updateEmail = async (event) => {
    event.preventDefault()
    setError(null)
    const next = email.trim()
    if (!next) {
      setError('Enter an email address.')
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }
    setBusyEmail(true)
    const { error: updateError } = await supabase.auth.updateUser({ email: next })
    setBusyEmail(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    toast.saved('Check your inbox to confirm the new email')
  }

  const updatePassword = async (event) => {
    event.preventDefault()
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
    setBusyPassword(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusyPassword(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setPassword('')
    setConfirm('')
    toast.saved()
  }

  return (
    <div className="role-block-stack">
      <SettingsSectionCard blockId="settings_login_email" title="Email">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Change the address you use to sign in. Supabase may send a confirmation link to the new inbox.
        </p>
        <form className="settings-form" onSubmit={updateEmail}>
          <label className="settings-form__field">
            <span>Login email</span>
            <input
              className="paper-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busyEmail}>
            {busyEmail ? 'Saving…' : 'Update email'}
          </button>
        </form>
      </SettingsSectionCard>

      <SettingsSectionCard blockId="settings_login_password" title="Password">
        <form className="settings-form" onSubmit={updatePassword}>
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
          <button type="submit" className="btn btn-primary" disabled={busyPassword}>
            {busyPassword ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </SettingsSectionCard>

      {error && <p className="auth-page__alert" role="alert">{error}</p>}
    </div>
  )
}
