import { useEffect, useState } from 'react'
import RoleBlockShell from '../../components/RoleBlockShell'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import {
  listCalendarConnections,
  listCalendarFeedTokens,
} from '../../lib/supabase/calendarConnectionsRepo'

/**
 * Profile block for Google Workspace / calendar sync.
 * OAuth connect + ICS feed generation land next; this surfaces connection state.
 */
export default function CalendarIntegrationsBlock() {
  const [connections, setConnections] = useState([])
  const [feeds, setFeeds] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isSupabaseConfigured()) {
        setLoading(false)
        return
      }
      try {
        const [nextConnections, nextFeeds] = await Promise.all([
          listCalendarConnections(),
          listCalendarFeedTokens(),
        ])
        if (!cancelled) {
          setConnections(nextConnections)
          setFeeds(nextFeeds)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load calendar integrations')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const google = connections.find((row) => row.provider === 'google')

  return (
    <RoleBlockShell blockId="profile_calendar_integrations">
      <div className="role-block__panel">
        {!isSupabaseConfigured() && (
          <p className="text-muted">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to enable sync.
          </p>
        )}

        {isSupabaseConfigured() && loading && (
          <p className="text-muted">Loading calendar connections…</p>
        )}

        {error && <p className="text-muted" role="alert">{error}</p>}

        {isSupabaseConfigured() && !loading && !error && (
          <>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <h3 className="role-block__panel-title">Google Calendar</h3>
              {google ? (
                <p>
                  Status: <strong>{google.status}</strong>
                  {google.account_email ? ` · ${google.account_email}` : ''}
                  <br />
                  <span className="text-small text-muted">
                    Pull busy: {google.pull_external_busy ? 'on' : 'off'} ·
                    Push appointments: {google.push_appointments ? 'on' : 'off'} ·
                    Privacy: {google.push_privacy}
                    {google.create_meet_links ? ' · Meet links on' : ''}
                  </span>
                </p>
              ) : (
                <p className="text-muted">
                  No Google account linked yet. OAuth connect will live here — scopes stay narrow
                  (<code>calendar.events</code> / <code>calendar.freebusy</code>) and outbound
                  titles default to busy-only so client names never leave encrypted storage.
                </p>
              )}
              <button type="button" className="btn btn-secondary" disabled>
                Connect Google Calendar (soon)
              </button>
            </div>

            <div className="form-group">
              <h3 className="role-block__panel-title">Calendar feed (ICS)</h3>
              <p className="text-muted text-small" style={{ marginTop: 0 }}>
                Same pattern Splose uses for phone/Outlook: a private feed URL you subscribe to in
                Google Calendar. Active feeds: {feeds.length}.
              </p>
              <button type="button" className="btn btn-secondary" disabled>
                Create feed URL (soon)
              </button>
            </div>
          </>
        )}
      </div>
    </RoleBlockShell>
  )
}
