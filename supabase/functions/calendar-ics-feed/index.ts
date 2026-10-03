import { sha256Hex } from '../_shared/crypto.ts'
import { adminClient } from '../_shared/supabaseAdmin.ts'

function icsEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function toIcsUtc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return new Response('Missing token', { status: 400 })

    const tokenHash = await sha256Hex(token)
    const supabase = adminClient()
    const { data: feed, error } = await supabase
      .from('calendar_feed_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle()
    if (error || !feed) return new Response('Not found', { status: 404 })

    await supabase.from('calendar_feed_tokens')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', feed.id)

    const now = new Date()
    const until = new Date(Date.now() + 120 * 24 * 60 * 60_000)
    const { data: appointments } = await supabase
      .from('appointments')
      .select('id, starts_at, ends_at, block_role, attendance_status, service_id, services(name, service_type)')
      .eq('owner_id', feed.owner_id)
      .gte('starts_at', now.toISOString())
      .lte('starts_at', until.toISOString())
      .order('starts_at', { ascending: true })

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//In the Room//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ]

    for (const appt of appointments || []) {
      if (appt.attendance_status === 'cancelled') continue
      let summary = 'Busy'
      if (feed.privacy_mode === 'service_label') {
        summary = appt.services?.name || appt.block_role || 'Busy'
      } else if (feed.privacy_mode === 'pseudonym') {
        summary = appt.block_role === 'support' ? 'Support' : 'Session'
      }
      lines.push(
        'BEGIN:VEVENT',
        `UID:${appt.id}@in-the-room`,
        `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
        `DTSTART:${toIcsUtc(appt.starts_at)}`,
        `DTEND:${toIcsUtc(appt.ends_at)}`,
        `SUMMARY:${icsEscape(summary)}`,
        'END:VEVENT',
      )
    }

    lines.push('END:VCALENDAR')
    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return new Response(error?.message || 'Feed error', { status: 500 })
  }
})
