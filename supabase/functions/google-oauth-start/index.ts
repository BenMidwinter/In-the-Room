import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { hmacSign } from '../_shared/crypto.ts'
import { userClient } from '../_shared/supabaseAdmin.ts'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)

    const supabase = userClient(authHeader)
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
    const siteUrl = Deno.env.get('SITE_URL')
    const encKey = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY')
    if (!clientId || !siteUrl || !encKey) {
      return jsonResponse({
        error: 'Missing GOOGLE_OAUTH_CLIENT_ID, SITE_URL, or CREDENTIALS_ENCRYPTION_KEY secrets',
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
