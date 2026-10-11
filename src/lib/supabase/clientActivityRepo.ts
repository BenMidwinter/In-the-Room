import { withOpenedPayloads } from './clinicalEnvelope'
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
      .select('id, client_id, author_id, letter_date, encrypted_payload, payload_format, created_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
    supabase
      .from('reports')
      .select('id, client_id, author_id, report_date, encrypted_payload, payload_format, created_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
    supabase
      .from('form_submissions')
      .select('id, client_id, form_definition_id, submitted_at, created_at, encrypted_payload, form_definitions(id, name, audience, payload_format, sealed_payload)')
      .eq('client_id', clientId)
      .order('submitted_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
    supabase
      .from('timeline_events')
      .select('id, client_id, actor_id, event_type, occurred_at, event_date, encrypted_summary, payload_format, ref_id')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .then((res) => res, () => ({ data: null, error: true })),
  ])

  const items: ClientActivityItem[] = []
  const letters = await withOpenedPayloads('letters', lettersRes.data || [])
  const reports = await withOpenedPayloads('reports', reportsRes.data || [])

  for (const row of letters) {
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

  for (const row of reports) {
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

  const formDefs = (formsRes.data || []).flatMap((row) => {
    const def = row.form_definitions as { id?: string; name?: string; audience?: string; payload_format?: string; sealed_payload?: Json } | { id?: string; name?: string; audience?: string; payload_format?: string; sealed_payload?: Json }[] | null
    const formDef = Array.isArray(def) ? def[0] : def
    return formDef?.id ? [{
      id: formDef.id,
      payload_format: formDef.payload_format,
      sealed_payload: formDef.sealed_payload ?? {},
      name: formDef.name,
      audience: formDef.audience,
    }] : []
  })
  const openedFormDefs = await withOpenedPayloads('form_definitions', formDefs, { payloadKey: 'sealed_payload' })
  const formDefById = new Map(openedFormDefs.map((row) => {
    const sealed = row.payload_format === 'envelope' && row.sealed_payload && typeof row.sealed_payload === 'object'
      ? row.sealed_payload as { name?: unknown }
      : null
    return [row.id, { name: sealed ? String(sealed.name || '') : row.name, audience: row.audience }]
  }))

  for (const row of formsRes.data || []) {
    const def = row.form_definitions as { id?: string } | { id?: string }[] | null
    const formDef = Array.isArray(def) ? def[0] : def
    const openedDef = formDef?.id ? formDefById.get(formDef.id) : null
    const formName = openedDef?.name
    items.push({
      id: `timeline-form-${row.id}`,
      client_id: clientId,
      type: 'form',
      title: formName || payloadTitle(row.encrypted_payload, 'Form submitted'),
      summary: openedDef?.audience === 'public' ? 'Added to the screener' : 'Form submitted',
      created_at: row.submitted_at || row.created_at,
      author_id: null,
      ref_id: row.id,
    })
  }

  const events = await withOpenedPayloads('timeline_events', (eventsRes.data || []).map((row) => ({
    ...row,
    encrypted_payload: row.encrypted_summary ?? {},
  })))

  for (const row of events) {
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
      title: payloadTitle(row.encrypted_payload, type.replace(/_/g, ' ')),
      summary: payloadSummary(row.encrypted_payload, ''),
      created_at: row.occurred_at
        || (row.event_date ? `${row.event_date}T12:00:00` : new Date().toISOString()),
      author_id: row.actor_id,
      ref_id: row.ref_id || row.id,
    })
  }

  return items
}
