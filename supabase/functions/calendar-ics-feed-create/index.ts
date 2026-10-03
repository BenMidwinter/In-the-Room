import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { sha256Hex } from '../_shared/crypto.ts'
import { userClient } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const privacyMode = body.privacy_mode || 'busy_only'
    const rawToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
    const tokenHash = await sha256Hex(rawToken)

    const { data, error } = await supabase.from('calendar_feed_tokens').insert({
      owner_id: user.id,
      token_hash: tokenHash,
      privacy_mode: privacyMode,
      label: 'Primary feed',
      is_active: true,
    }).select('id').single()
    if (error) throw error

    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-ics-feed?token=${rawToken}`
    return jsonResponse({ id: data.id, url, privacy_mode: privacyMode })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Feed create failed' }, 500)
  }
})
