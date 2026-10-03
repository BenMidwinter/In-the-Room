import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { hmacSign } from '../_shared/crypto.ts'
import { userClient } from '../_shared/supabaseAdmin.ts'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ')

function secret(name: string): string {
  return String(Deno.env.get(name) || '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)

    const supabase = userClient(authHeader)
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    // CLIENT_SECRET is only needed in google-oauth-callback (token exchange), not here.
    const clientId = secret('GOOGLE_OAUTH_CLIENT_ID')
    const siteUrl = secret('SITE_URL') || req.headers.get('origin') || ''
    const encKey = secret('CREDENTIALS_ENCRYPTION_KEY') || secret('SUPABASE_SERVICE_ROLE_KEY')

    const missing: string[] = []
    if (!clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID')
    if (!siteUrl) missing.push('SITE_URL')
    if (!encKey) missing.push('CREDENTIALS_ENCRYPTION_KEY')
    if (missing.length) {
      return jsonResponse({
        error: `Missing Edge Function secrets: ${missing.join(', ')}. Add them under Project Settings → Edge Functions → Secrets (exact names, no trailing spaces).`,
      }, 500)
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`
    const payload = JSON.stringify({
      uid: user.id,
      exp: Date.now() + 10 * 60_000,
      nonce: crypto.randomUUID(),
    })
    const stateBody = btoa(payload)
    const sig = await hmacSign(encKey, stateBody)
    const state = `${stateBody}.${sig}`

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('state', state)

    return jsonResponse({ url: url.toString() })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'OAuth start failed' }, 500)
  }
})
