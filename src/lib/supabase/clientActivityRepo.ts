import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

export type ClientActivityItem = {
  id: string
  client_id: string
  type: 'letter' | 'report' | 'form' | 'event'
  title: string
  summary: string
  created_at: string
  author_id?: string | null
  ref_id: string
}

function payloadTitle(raw: Json | null | undefined, fallback: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const title = (raw as { title?: unknown }).title
  if (typeof title === 'string' && title.trim()) return title.trim()
  const name = (raw as { name?: unknown }).name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return fallback
}

function payloadSummary(raw: Json | null | undefined, fallback: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const summary = (raw as { summary?: unknown }).summary
  if (typeof summary === 'string' && summary.trim()) return summary.trim()
  const recipient = (raw as { recipient?: unknown }).recipient
  if (typeof recipient === 'string' && recipient.trim()) return `To ${recipient.trim()}`
  return fallback
}

/** Live activity log for a client: letters, reports, form submissions, timeline events. */
export async function listClientActivity(clientId: string): Promise<ClientActivityItem[]> {
  if (!isSupabaseConfigured() || !clientId) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const [lettersRes, reportsRes, formsRes, eventsRes] = await Promise.all([
    supabase
      .from('letters')
      .select('id, client_id, author_id, letter_date, encrypted_payload, created_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
    supabase
      .from('reports')
      .select('id, client_id, author_id, report_date, encrypted_payload, created_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
    supabase
      .from('form_submissions')
      .select('id, client_id, form_definition_id, submitted_at, created_at, encrypted_payload, form_definitions(name, audience)')
      .eq('client_id', clientId)
      .order('submitted_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
    supabase
      .from('timeline_events')
      .select('id, client_id, actor_id, event_type, occurred_at, event_date, encrypted_summary, ref_id')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
  ])

  const items: ClientActivityItem[] = []

  for (const row of lettersRes.data || []) {
    items.push({
      id: `timeline-letter-${row.id}`,
      client_id: clientId,
      type: 'letter',
      title: payloadTitle(row.encrypted_payload, 'Letter created'),
      summary: [
        row.letter_date || String(row.created_at).slice(0, 10),
        payloadSummary(row.encrypted_payload, 'Letter created'),
      ].filter(Boolean).join(' · '),
      created_at: row.letter_date
        ? `${row.letter_date}T12:00:00`
        : (row.updated_at || row.created_at),
      author_id: row.author_id,
      ref_id: row.id,
    })
  }

  for (const row of reportsRes.data || []) {
    items.push({
      id: `timeline-report-${row.id}`,
      client_id: clientId,
      type: 'report',
      title: payloadTitle(row.encrypted_payload, 'Report created'),
      summary: [
        row.report_date || String(row.created_at).slice(0, 10),
        'Report created',
      ].filter(Boolean).join(' · '),
      created_at: row.report_date
        ? `${row.report_date}T12:00:00`
        : (row.updated_at || row.created_at),
      author_id: row.author_id,
      ref_id: row.id,
    })
  }

  for (const row of formsRes.data || []) {
    const def = row.form_definitions as { name?: string; audience?: string } | { name?: string; audience?: string }[] | null
    const formDef = Array.isArray(def) ? def[0] : def
    const formName = formDef?.name
    items.push({
      id: `timeline-form-${row.id}`,
      client_id: clientId,
      type: 'form',
      title: formName || payloadTitle(row.encrypted_payload, 'Form submitted'),
      summary: formDef?.audience === 'public' ? 'Added to the waitlist' : 'Form submitted',
      created_at: row.submitted_at || row.created_at,
      author_id: null,
      ref_id: row.id,
    })
  }

  for (const row of eventsRes.data || []) {
    const type = String(row.event_type || 'event')
    const mappedType = type.includes('letter')
      ? 'letter'
      : type.includes('report')
        ? 'report'
        : type.includes('form')
          ? 'form'
          : 'event'
    items.push({
      id: `timeline-remote-${row.id}`,
      client_id: clientId,
      type: mappedType,
      title: payloadTitle(row.encrypted_summary, type.replace(/_/g, ' ')),
      summary: payloadSummary(row.encrypted_summary, ''),
      created_at: row.occurred_at
        || (row.event_date ? `${row.event_date}T12:00:00` : new Date().toISOString()),
      author_id: row.actor_id,
      ref_id: row.ref_id || row.id,
    })
  }

  return items
}
