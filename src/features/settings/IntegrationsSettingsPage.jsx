import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase/client'
import { listCalendarConnections } from '../../lib/supabase/calendarConnectionsRepo'
import { invokeFunction } from '../../lib/supabase/invokeFunction'
import { useToast } from '../../components/ui'

export default function IntegrationsSettingsPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [connections, setConnections] = useState([])
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedUrl, setFeedUrl] = useState(null)

  const google = connections.find((row) => row.provider === 'google' && row.status === 'connected')
    || connections.find((row) => row.provider === 'google')

  const reload = async () => {
    const nextConnections = await listCalendarConnections()
    setConnections(nextConnections)
    return nextConnections
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    reload().catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    const status = params.get('google')
    if (!status) return

    const message = params.get('message')
    const pulled = params.get('pulled')
    const email = params.get('email')

    const next = new URLSearchParams(params)
    ;['google', 'message', 'pulled', 'email'].forEach((key) => next.delete(key))
    setParams(next, { replace: true })

    if (status === 'connected') {
      const syncNote = pulled != null ? ` Pulled ${pulled} busy block${pulled === '1' ? '' : 's'}.` : ''
      setInfo(`Connected${email ? ` as ${email}` : ''}.${syncNote}`)
      toast.saved('Google connected')
      reload()
        .then(async (rows) => {
          const linked = rows.find((row) => row.provider === 'google' && row.status === 'connected')
          if (!linked || pulled != null) return
          try {
            const data = await invokeFunction('google-calendar-sync', { method: 'POST', body: {} })
            setInfo(`Connected. Pulled ${data?.pulled ?? 0} busy blocks.`)
            await reload()
          } catch (err) {
            setError(err.message || 'Connected, but sync failed. Try Sync now.')
          }
        })
        .catch(() => {})
      return
    }

    if (status === 'error') {
      const detail = message || 'Google connection failed.'
      setError(detail)
      toast.error(detail)
    }
  }, [params, setParams, toast])

  const connectGoogle = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const data = await invokeFunction('google-oauth-start', { method: 'POST', body: {} })
      if (!data?.url) throw new Error('No OAuth URL returned. Check edge function secrets.')
      window.location.assign(data.url)
    } catch (err) {
      setError(err.message || 'Could not start Google OAuth')
      setBusy(false)
    }
  }

  const updateFlags = async (patch) => {
    if (!google) return
    const supabase = getSupabase()
    if (!supabase) return
    setBusy(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('calendar_connections')
        .update(patch)
        .eq('id', google.id)
      if (updateError) throw updateError
      await reload()
      toast.saved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const createFeed = async () => {
    setBusy(true)
    setError(null)
    setFeedUrl(null)
    try {
      const data = await invokeFunction('calendar-ics-feed-create', { method: 'POST', body: { privacy_mode: 'busy_only' } })
      if (!data?.url) throw new Error('Feed URL was not returned')
      setFeedUrl(data.url)
      setInfo('Private calendar feed created. Add this URL in Google Calendar → From URL.')
      await reload()
      toast.saved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await invokeFunction('google-calendar-sync', { method: 'POST', body: {} })
      setInfo(`Synced ${data?.pulled ?? 0} busy blocks.`)
      await reload()
      toast.saved('Synced')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId="settings_integrations_google" title="Google Calendar">
        {!isSupabaseConfigured() && (
          <p className="auth-page__alert">Supabase env vars required.</p>
        )}

        <div className="settings-google-row">
          <img
            className="settings-google-row__icon"
            src="/integrations/google-calendar.jpg"
            alt=""
            width={40}
            height={40}
          />
          <div className="settings-google-row__body">
            <div className="settings-google-row__title">
              <strong>Google Calendar</strong>
              {google?.status === 'connected' ? (
                <span className="badge badge-green">Connected</span>
              ) : (
                <span className="badge badge-grey">Not linked</span>
              )}
            </div>
            {google?.status === 'connected' ? (
              <p className="settings-google-row__meta">
                {google.account_email || 'Linked account'}
                {google.last_synced_at
                  ? ` · synced ${new Date(google.last_synced_at).toLocaleString()}`
                  : ''}
              </p>
            ) : (
              <p className="settings-google-row__meta">
                Link your account to pull busy time and create Meet links.
              </p>
            )}
          </div>
          <div className="settings-google-row__actions">
            {google?.status === 'connected' ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={syncNow} disabled={busy}>
                  Sync now
                </button>
                <button type="button" className="btn btn-secondary" onClick={connectGoogle} disabled={busy}>
                  Reconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={connectGoogle}
                disabled={busy || !isSupabaseConfigured()}
              >
                {busy ? 'Redirecting…' : 'Connect'}
              </button>
            )}
          </div>
        </div>

        {google?.status === 'connected' && (
          <div className="settings-integration settings-integration--compact">
            {google.last_error && (
              <p className="auth-page__alert" role="alert">
                Last sync error: {google.last_error}
              </p>
            )}
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(google.pull_external_busy)}
                onChange={(e) => updateFlags({ pull_external_busy: e.target.checked })}
                disabled={busy}
              />
              Pull Google busy time
            </label>
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(google.push_appointments)}
                onChange={(e) => updateFlags({ push_appointments: e.target.checked })}
                disabled={busy}
              />
              Push appointments to Google
            </label>
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(google.create_meet_links)}
                onChange={(e) => updateFlags({ create_meet_links: e.target.checked })}
                disabled={busy}
              />
              Allow Google Meet for opted-in services
            </label>
          </div>
        )}

        {error && (
          <p className="auth-page__alert" role="alert">
            {error}
            {/GOOGLE_OAUTH|SITE_URL|CREDENTIALS_ENCRYPTION|refresh token|Invalid state|Token exchange/i.test(error) && (
              <>
                {' '}Check Edge Function secrets and Google redirect URI
                {' '}<code>…/functions/v1/google-oauth-callback</code>.
              </>
            )}
          </p>
        )}
        {info && <p className="auth-page__info">{info}</p>}
      </SettingsSectionCard>

      <SettingsSectionCard blockId="settings_integrations_feed" title="Calendar feed (ICS)">
        <button type="button" className="btn btn-secondary" onClick={createFeed} disabled={busy || !isSupabaseConfigured()}>
          Create feed URL
        </button>
        {feedUrl && (
          <p className="settings-feed-url">
            <code>{feedUrl}</code>
          </p>
        )}
      </SettingsSectionCard>
    </div>
  )
}
