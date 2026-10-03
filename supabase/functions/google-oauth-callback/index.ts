import { hmacSign, encryptJson, decryptJson } from '../_shared/crypto.ts'
import { pullExternalBusyBlocks } from '../_shared/googleBusyPull.ts'
import { credentialsKey, secret } from '../_shared/secrets.ts'
import { adminClient } from '../_shared/supabaseAdmin.ts'

type StoredCreds = {
  access_token: string
  refresh_token?: string
  expiry: number
  token_type?: string
  scope?: string
}

function redirect(siteUrl: string, query: Record<string, string>) {
  const url = new URL('/settings/integrations', siteUrl)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return Response.redirect(url.toString(), 302)
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return atob(padded + pad)
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.email === 'string' ? data.email : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const siteUrl = secret('SITE_URL') || 'http://localhost:5173'
  try {
    const incoming = new URL(req.url)
    const code = incoming.searchParams.get('code')
    const state = incoming.searchParams.get('state')
    const oauthError = incoming.searchParams.get('error')
    if (oauthError) {
      console.error('google-oauth-callback google_error', oauthError)
      return redirect(siteUrl, { google: 'error', message: oauthError })
    }
    if (!code || !state) {
      console.error('google-oauth-callback missing_code_or_state', {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        search: incoming.search,
      })
      return redirect(siteUrl, { google: 'error', message: 'Missing code/state' })
    }

    const clientId = secret('GOOGLE_OAUTH_CLIENT_ID')
    const clientSecret = secret('GOOGLE_OAUTH_CLIENT_SECRET')
    const encKey = credentialsKey()
    if (!clientId || !clientSecret || !encKey) {
      const missing = [
        !clientId && 'GOOGLE_OAUTH_CLIENT_ID',
        !clientSecret && 'GOOGLE_OAUTH_CLIENT_SECRET',
        !encKey && 'CREDENTIALS_ENCRYPTION_KEY',
      ].filter(Boolean).join(', ')
      console.error('google-oauth-callback missing_secrets', missing)
      return redirect(siteUrl, {
        google: 'error',
        message: `Missing Edge Function secrets: ${missing}`,
      })
    }

    const [stateBody, sig] = state.split('.')
    if (!stateBody || !sig) {
      return redirect(siteUrl, { google: 'error', message: 'Invalid state' })
    }
    const expected = await hmacSign(encKey, stateBody)
    if (sig !== expected) {
      console.error('google-oauth-callback invalid_state_signature')
      return redirect(siteUrl, { google: 'error', message: 'Invalid state' })
    }

    let parsed: { uid: string; exp: number }
    try {
      parsed = JSON.parse(fromBase64Url(stateBody)) as { uid: string; exp: number }
    } catch {
      // Backward-compatible with older standard-base64 state payloads.
      parsed = JSON.parse(atob(stateBody)) as { uid: string; exp: number }
    }
    if (!parsed.uid || Date.now() > parsed.exp) {
      return redirect(siteUrl, { google: 'error', message: 'State expired' })
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('google-oauth-callback token_exchange_failed', tokens)
      return redirect(siteUrl, {
        google: 'error',
        message: tokens.error_description || tokens.error || 'Token exchange failed',
      })
    }
    if (!tokens.access_token) {
      return redirect(siteUrl, { google: 'error', message: 'No access token from Google' })
    }

    let accountEmail: string | null = null
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(atob(tokens.id_token.split('.')[1]))
        accountEmail = payload.email || null
      } catch {
        accountEmail = null
      }
    }
    if (!accountEmail) {
      accountEmail = await fetchGoogleEmail(tokens.access_token)
    }

    const supabase = adminClient()
    const { data: existing } = await supabase
      .from('calendar_connections')
      .select('id, encrypted_credentials')
      .eq('owner_id', parsed.uid)
      .eq('provider', 'google')
      .maybeSingle()

    let previousRefresh: string | undefined
    if (existing?.encrypted_credentials) {
      try {
        const prev = await decryptJson<StoredCreds>(
          encKey,
          existing.encrypted_credentials as Record<string, string>,
        )
        previousRefresh = prev.refresh_token
      } catch {
        previousRefresh = undefined
      }
    }

    const refreshToken = tokens.refresh_token || previousRefresh
    if (!refreshToken) {
      console.error('google-oauth-callback missing_refresh_token')
      return redirect(siteUrl, {
        google: 'error',
        message: 'Google did not return a refresh token. Reconnect and grant offline access.',
      })
    }

    const encrypted = await encryptJson(encKey, {
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expiry: Date.now() + (tokens.expires_in || 3600) * 1000,
      token_type: tokens.token_type,
      scope: tokens.scope,
    } satisfies StoredCreds)

    const row = {
      owner_id: parsed.uid,
      provider: 'google',
      account_email: accountEmail,
      status: 'connected',
      scopes: String(tokens.scope || '').split(' ').filter(Boolean),
      encrypted_credentials: encrypted,
      google_calendar_id: 'primary',
      pull_external_busy: true,
      push_appointments: true,
      create_meet_links: true,
      push_privacy: 'busy_only',
      last_error: null,
      last_synced_at: null as string | null,
    }

    const { data: saved, error } = existing
      ? await supabase.from('calendar_connections').update(row).eq('id', existing.id).select('id').single()
      : await supabase.from('calendar_connections').insert(row).select('id').single()

    if (error || !saved) {
      console.error('google-oauth-callback save_failed', error)
      return redirect(siteUrl, { google: 'error', message: error?.message || 'Could not save connection' })
    }

    let pulled = 0
    try {
      pulled = await pullExternalBusyBlocks({
        accessToken: tokens.access_token,
        ownerId: parsed.uid,
        connectionId: saved.id,
        calendarId: 'primary',
      })
      await supabase.from('calendar_connections').update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', saved.id)
    } catch (syncError) {
      console.error('google-oauth-callback initial_sync_failed', syncError)
      await supabase.from('calendar_connections').update({
        last_error: syncError?.message || 'Initial sync failed',
      }).eq('id', saved.id)
    }

    console.log('google-oauth-callback connected', {
      uid: parsed.uid,
      email: accountEmail,
      pulled,
      connectionId: saved.id,
    })
    return redirect(siteUrl, {
      google: 'connected',
      pulled: String(pulled),
      ...(accountEmail ? { email: accountEmail } : {}),
    })
  } catch (error) {
    console.error('google-oauth-callback fatal', error)
    return redirect(siteUrl, { google: 'error', message: error?.message || 'OAuth callback failed' })
  }
})
