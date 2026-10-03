import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase/client'
import {
  listCalendarConnections,
  listCalendarFeedTokens,
} from '../../lib/supabase/calendarConnectionsRepo'

async function invokeFunction(name, options = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke(name, options)
  if (error) throw error
  return data
}

export default function IntegrationsSettingsPage() {
  const [params] = useSearchParams()
  const [connections, setConnections] = useState([])
  const [feeds, setFeeds] = useState([])
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedUrl, setFeedUrl] = useState(null)

  const google = connections.find((row) => row.provider === 'google')

  const reload = async () => {
    const [nextConnections, nextFeeds] = await Promise.all([
      listCalendarConnections(),
      listCalendarFeedTokens(),
    ])
    setConnections(nextConnections)
    setFeeds(nextFeeds)
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    reload().catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (params.get('google') === 'connected') {
      setInfo('Google Calendar connected.')
      reload().catch(() => {})
    }
    if (params.get('google') === 'error') {
      setError(params.get('message') || 'Google connection failed.')
    }
  }, [params])

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
      setInfo('Integration settings saved.')
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
      setInfo(`Sync complete. Pulled ${data?.pulled ?? 0} busy blocks.`)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="role-block-stack">
      <SettingsSectionCard blockId="settings_integrations_google" title="Google Workspace">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Connect Google Calendar to pull personal busy time into In the Room, push practice
          blocks outward, and create Meet links on appointment types that opt in.
        </p>

        {!isSupabaseConfigured() && (
          <p className="auth-page__alert">Supabase env vars required.</p>
        )}

        {google ? (
          <div className="settings-integration">
            <p>
              Status: <strong>{google.status}</strong>
              {google.account_email ? ` · ${google.account_email}` : ''}
            </p>
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(google.pull_external_busy)}
                onChange={(e) => updateFlags({ pull_external_busy: e.target.checked })}
                disabled={busy}
              />
              Pull Google busy time into calendar
            </label>
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(google.push_appointments)}
                onChange={(e) => updateFlags({ push_appointments: e.target.checked })}
                disabled={busy}
              />
              Push practice appointments to Google
            </label>
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(google.create_meet_links)}
                onChange={(e) => updateFlags({ create_meet_links: e.target.checked })}
                disabled={busy}
              />
              Allow Google Meet links for opted-in services
            </label>
            <div className="settings-form__actions">
              <button type="button" className="btn btn-secondary" onClick={syncNow} disabled={busy}>
                Sync now
              </button>
              <button type="button" className="btn btn-secondary" onClick={connectGoogle} disabled={busy}>
                Reconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-integration">
            <p className="text-muted">
              No Google account linked. You will need Google OAuth client credentials set as
              Supabase secrets (<code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code>,
              <code>SITE_URL</code>, <code>CREDENTIALS_ENCRYPTION_KEY</code>).
            </p>
            <button type="button" className="btn btn-primary" onClick={connectGoogle} disabled={busy || !isSupabaseConfigured()}>
              {busy ? 'Redirecting…' : 'Connect Google Calendar'}
            </button>
          </div>
        )}

        {error && <p className="auth-page__alert" role="alert">{error}</p>}
        {info && <p className="auth-page__info">{info}</p>}
      </SettingsSectionCard>

      <SettingsSectionCard blockId="settings_integrations_feed" title="Calendar feed (ICS)">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Splose-style private feed for phones and Outlook. Events export as busy blocks by default
          (no client names). Active feeds: {feeds.length}.
        </p>
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
