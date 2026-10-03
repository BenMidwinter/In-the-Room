import { hmacSign, encryptJson } from '../_shared/crypto.ts'
import { adminClient } from '../_shared/supabaseAdmin.ts'

function redirect(siteUrl: string, query: Record<string, string>) {
  const url = new URL('/settings/integrations', siteUrl)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return Response.redirect(url.toString(), 302)
}

Deno.serve(async (req) => {
  const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
  try {
    const incoming = new URL(req.url)
    const code = incoming.searchParams.get('code')
    const state = incoming.searchParams.get('state')
    const oauthError = incoming.searchParams.get('error')
    if (oauthError) return redirect(siteUrl, { google: 'error', message: oauthError })
    if (!code || !state) return redirect(siteUrl, { google: 'error', message: 'Missing code/state' })

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!
    const encKey = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY')!
    const [stateBody, sig] = state.split('.')
    const expected = await hmacSign(encKey, stateBody)
    if (sig !== expected) return redirect(siteUrl, { google: 'error', message: 'Invalid state' })

    const parsed = JSON.parse(atob(stateBody)) as { uid: string; exp: number }
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
      return redirect(siteUrl, { google: 'error', message: tokens.error || 'Token exchange failed' })
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

    const encrypted = await encryptJson(encKey, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry: Date.now() + (tokens.expires_in || 3600) * 1000,
      token_type: tokens.token_type,
      scope: tokens.scope,
    })

    const supabase = adminClient()
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
    }

    const { data: existing } = await supabase
      .from('calendar_connections')
      .select('id')
      .eq('owner_id', parsed.uid)
      .eq('provider', 'google')
      .maybeSingle()

    const { error } = existing
      ? await supabase.from('calendar_connections').update(row).eq('id', existing.id)
      : await supabase.from('calendar_connections').insert(row)

    if (error) return redirect(siteUrl, { google: 'error', message: error.message })
    return redirect(siteUrl, { google: 'connected' })
  } catch (error) {
    return redirect(siteUrl, { google: 'error', message: error?.message || 'OAuth callback failed' })
  }
})
