import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { decryptJson, encryptJson } from '../_shared/crypto.ts'
import { ITR_GOOGLE_SOURCE } from '../_shared/googleBusyPull.ts'
import { credentialsKey } from '../_shared/secrets.ts'
import { userClient, adminClient } from '../_shared/supabaseAdmin.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const { appointmentId, startsAt, endsAt, summary } = body
    if (!appointmentId || !startsAt || !endsAt) {
      return jsonResponse({ error: 'appointmentId, startsAt, endsAt required' }, 400)
    }

    const { data: connection } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('provider', 'google')
      .eq('status', 'connected')
      .maybeSingle()
    if (!connection?.create_meet_links) {
      return jsonResponse({ error: 'Google Meet not enabled on connection' }, 400)
    }

    const encKey = credentialsKey()
    if (!encKey) return jsonResponse({ error: 'Missing CREDENTIALS_ENCRYPTION_KEY' }, 500)

    let creds = await decryptJson<Creds>(
      encKey,
      connection.encrypted_credentials as Record<string, string>,
    )
    creds = await refreshAccessToken(creds)

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
          // Stay opaque on Google so external booking sees you as busy —
          // busy pull filters these out via extendedProperties / link table.
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

    const encrypted = await encryptJson(encKey, creds)
    await admin.from('calendar_connections').update({
      encrypted_credentials: encrypted,
      last_error: null,
    }).eq('id', connection.id)

    return jsonResponse({ meetUrl, externalEventId: event.id })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Meet create failed' }, 500)
  }
})
