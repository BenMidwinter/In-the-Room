import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { decryptJson, encryptJson } from '../_shared/crypto.ts'
import { credentialsKey } from '../_shared/secrets.ts'
import { userClient, adminClient } from '../_shared/supabaseAdmin.ts'

/** Private extended property written onto Google events created by In the Room. */
const ITR_GOOGLE_SOURCE = 'in_the_room'

type Creds = {
  access_token: string
  refresh_token?: string
  expiry: number
}

async function refreshAccessToken(creds: Creds): Promise<Creds> {
  if (Date.now() < creds.expiry - 60_000) return creds
  if (!creds.refresh_token) throw new Error('Missing refresh token')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to refresh Google token')
  return {
    ...creds,
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in || 3600) * 1000,
  }
}

async function loadGoogleConnection(supabase: ReturnType<typeof userClient>) {
  const { data: connection } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('provider', 'google')
    .eq('status', 'connected')
    .maybeSingle()
  return connection
}

async function withFreshCreds(connection: {
  id: string
  encrypted_credentials: Record<string, string>
}) {
  const encKey = credentialsKey()
  if (!encKey) throw new Error('Missing CREDENTIALS_ENCRYPTION_KEY')
  let creds = await decryptJson<Creds>(encKey, connection.encrypted_credentials)
  creds = await refreshAccessToken(creds)
  return { encKey, creds }
}

async function persistCreds(
  connectionId: string,
  encKey: string,
  creds: Creds,
) {
  const admin = adminClient()
  const encrypted = await encryptJson(encKey, creds)
  await admin.from('calendar_connections').update({
    encrypted_credentials: encrypted,
    last_error: null,
  }).eq('id', connectionId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const action = body.action || 'create'

    if (action === 'delete') {
      const appointmentIds: string[] = Array.isArray(body.appointmentIds)
        ? body.appointmentIds.map(String)
        : body.appointmentId
          ? [String(body.appointmentId)]
          : []
      if (!appointmentIds.length) {
        return jsonResponse({ error: 'appointmentIds required' }, 400)
      }

      const connection = await loadGoogleConnection(supabase)
      if (!connection) {
        return jsonResponse({ deleted: 0, skipped: true, reason: 'not_connected' })
      }

      const { data: links } = await supabase
        .from('appointment_external_links')
        .select('id, appointment_id, external_event_id, connection_id')
        .in('appointment_id', appointmentIds)

      if (!links?.length) {
        return jsonResponse({ deleted: 0, skipped: true, reason: 'no_links' })
      }

      const { encKey, creds } = await withFreshCreds(connection)
      const calendarId = connection.google_calendar_id || 'primary'
      let deleted = 0
      const errors: string[] = []

      for (const link of links) {
        if (!link.external_event_id) continue
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(link.external_event_id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${creds.access_token}` },
          },
        )
        // 404/410 = already gone on Google — treat as success
        if (delRes.ok || delRes.status === 404 || delRes.status === 410) {
          deleted += 1
        } else {
          const errBody = await delRes.json().catch(() => ({}))
          errors.push(errBody?.error?.message || `HTTP ${delRes.status}`)
        }
      }

      await persistCreds(connection.id, encKey, creds)
      return jsonResponse({
        deleted,
        errors: errors.length ? errors : undefined,
      })
    }

    // Default: create Meet event + link
    const { appointmentId, startsAt, endsAt, summary } = body
    if (!appointmentId || !startsAt || !endsAt) {
      return jsonResponse({ error: 'appointmentId, startsAt, endsAt required' }, 400)
    }

    const connection = await loadGoogleConnection(supabase)
    if (!connection?.create_meet_links) {
      return jsonResponse({ error: 'Google Meet not enabled on connection' }, 400)
    }

    const { encKey, creds } = await withFreshCreds(connection)

    const requestId = crypto.randomUUID()
    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.google_calendar_id || 'primary')}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: summary || 'In the Room session',
          start: { dateTime: startsAt },
          end: { dateTime: endsAt },
          transparency: 'opaque',
          extendedProperties: {
            private: {
              source: ITR_GOOGLE_SOURCE,
              in_the_room: '1',
              appointment_id: String(appointmentId),
            },
          },
          conferenceData: {
            createRequest: {
              requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      },
    )
    const event = await eventRes.json()
    if (!eventRes.ok) throw new Error(event.error?.message || 'Failed to create Meet event')

    const meetUrl = event.hangoutLink
      || event.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === 'video')?.uri
      || null

    const admin = adminClient()
    await admin.from('appointment_external_links').upsert({
      owner_id: user.id,
      appointment_id: appointmentId,
      connection_id: connection.id,
      external_event_id: event.id,
      meet_url: meetUrl,
      sync_status: 'synced',
      last_pushed_at: new Date().toISOString(),
    }, { onConflict: 'appointment_id,connection_id' })

    await persistCreds(connection.id, encKey, creds)

    return jsonResponse({ meetUrl, externalEventId: event.id })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Meet create failed' }, 500)
  }
})
