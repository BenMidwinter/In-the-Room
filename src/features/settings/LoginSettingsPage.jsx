import { useEffect, useState } from 'react'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { getSupabase } from '../../lib/supabase/client'
import { confirmCurrentPassword } from '../../lib/auth/confirmPassword'
import { useToast } from '../../components/ui'

export default function LoginSettingsPage() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [passwordError, setPasswordError] = useState(null)
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
    setPasswordError(null)
    if (!currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }
    if (password.length < 8) {
      setPasswordError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setPasswordError('Passwords do not match.')
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      setPasswordError('Supabase is not configured.')
      return
    }
    setBusyPassword(true)
    try {
      await confirmCurrentPassword(currentPassword)
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setPasswordError(updateError.message)
        return
      }
      setCurrentPassword('')
      setPassword('')
      setConfirm('')
      toast.saved()
    } catch (err) {
      setPasswordError(err?.message || 'That password does not match.')
    } finally {
      setBusyPassword(false)
    }
  }

  return (
    <>
      <SettingsSectionCard
        blockId="settings_login_email"
        title="Email"
        description="Change the address you use to sign in. A confirmation link may be sent to the new inbox."
      >
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
            <span>Current password</span>
            <input
              className="paper-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
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
          {passwordError && <p className="auth-page__alert" role="alert">{passwordError}</p>}
          <button type="submit" className="btn btn-primary" disabled={busyPassword}>
            {busyPassword ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </SettingsSectionCard>

      {error && <p className="auth-page__alert" role="alert">{error}</p>}
    </>
  )
}
