import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { decryptJson, encryptJson } from '../_shared/crypto.ts'
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

    const encKey = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY')!
    const { data: connection, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('provider', 'google')
      .eq('status', 'connected')
      .maybeSingle()
    if (error || !connection) return jsonResponse({ error: 'Google not connected' }, 400)
    if (!connection.pull_external_busy) return jsonResponse({ pulled: 0, skipped: true })

    let creds = await decryptJson<Creds>(encKey, connection.encrypted_credentials)
    creds = await refreshAccessToken(creds)

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString()
    const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: connection.google_calendar_id || 'primary' }],
      }),
    })
    const freeBusy = await freeBusyRes.json()
    if (!freeBusyRes.ok) throw new Error(freeBusy.error?.message || 'freeBusy failed')

    const calId = connection.google_calendar_id || 'primary'
    const busy = freeBusy.calendars?.[calId]?.busy || []
    const admin = adminClient()

    await admin.from('external_calendar_blocks')
      .delete()
      .eq('connection_id', connection.id)
      .gte('starts_at', timeMin)

    const rows = busy.map((slot: { start: string; end: string }, idx: number) => ({
      owner_id: user.id,
      connection_id: connection.id,
      external_event_id: `busy-${slot.start}-${idx}`,
      starts_at: slot.start,
      ends_at: slot.end,
      is_all_day: false,
      busy_status: 'busy',
      synced_at: new Date().toISOString(),
    }))

    if (rows.length) {
      const { error: insertError } = await admin.from('external_calendar_blocks').insert(rows)
      if (insertError) throw insertError
    }

    const encrypted = await encryptJson(encKey, creds)
    await admin.from('calendar_connections').update({
      encrypted_credentials: encrypted,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', connection.id)

    return jsonResponse({ pulled: rows.length })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Sync failed' }, 500)
  }
})
