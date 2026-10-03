import { adminClient } from './supabaseAdmin.ts'

/** Private extended property written onto Google events created by In the Room. */
export const ITR_GOOGLE_SOURCE = 'in_the_room'

export type BusyBlockRow = {
  owner_id: string
  connection_id: string
  external_event_id: string
  starts_at: string
  ends_at: string
  is_all_day: boolean
  busy_status: string
  synced_at: string
}

type GoogleEvent = {
  id?: string
  status?: string
  transparency?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  extendedProperties?: {
    private?: Record<string, string>
    shared?: Record<string, string>
  }
}

function eventStartIso(event: GoogleEvent): string | null {
  if (event.start?.dateTime) return event.start.dateTime
  if (event.start?.date) return `${event.start.date}T00:00:00.000Z`
  return null
}

function eventEndIso(event: GoogleEvent): string | null {
  if (event.end?.dateTime) return event.end.dateTime
  if (event.end?.date) return `${event.end.date}T00:00:00.000Z`
  return null
}

/** True when this Google event was created from In the Room (Meet / push). */
export function isInTheRoomGoogleEvent(
  event: GoogleEvent,
  linkedExternalIds: Set<string>,
): boolean {
  if (event.id && linkedExternalIds.has(event.id)) return true
  const priv = event.extendedProperties?.private || {}
  if (priv.source === ITR_GOOGLE_SOURCE || priv.in_the_room === '1') return true
  const summary = String(event.summary || '').trim()
  if (/^in the room\b/i.test(summary)) return true
  return false
}

async function listGoogleEvents(opts: {
  accessToken: string
  calendarId: string
  timeMin: string
  timeMax: string
}): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      maxResults: '250',
      // ShowDeleted=false is default; we also skip cancelled below.
    })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events?${params}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'Google events.list failed')
    for (const item of data.items || []) events.push(item as GoogleEvent)
    pageToken = data.nextPageToken
  } while (pageToken)
  return events
}

/**
 * Pull opaque Google Calendar events as busy blocks, excluding anything that
 * originated from In the Room (tagged Meet/push events and known external ids).
 * Events stay busy on Google for external scheduling — we only stop echoing them here.
 */
export async function pullExternalBusyBlocks(opts: {
  accessToken: string
  ownerId: string
  connectionId: string
  calendarId: string
}): Promise<number> {
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString()
  const admin = adminClient()

  const { data: links } = await admin
    .from('appointment_external_links')
    .select('external_event_id')
    .eq('connection_id', opts.connectionId)
  const linkedIds = new Set(
    (links || []).map((row: { external_event_id: string }) => row.external_event_id).filter(Boolean),
  )

  // Also treat exact In the Room appointment windows as "ours" so untagged
  // legacy Meet events (summary/id unknown) don't reappear as busy overlays.
  const { data: appointments } = await admin
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('owner_id', opts.ownerId)
    .gte('ends_at', timeMin)
    .lte('starts_at', timeMax)
  const itrWindows = (appointments || []).map((row: { starts_at: string; ends_at: string }) => ({
    startMs: new Date(row.starts_at).getTime(),
    endMs: new Date(row.ends_at).getTime(),
  })).filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs))

  const events = await listGoogleEvents({
    accessToken: opts.accessToken,
    calendarId: opts.calendarId,
    timeMin,
    timeMax,
  })

  const syncedAt = new Date().toISOString()
  const rows: BusyBlockRow[] = []

  for (const event of events) {
    if (!event.id || event.status === 'cancelled') continue
    if (event.transparency === 'transparent') continue
    if (isInTheRoomGoogleEvent(event, linkedIds)) continue

    const startsAt = eventStartIso(event)
    const endsAt = eventEndIso(event)
    if (!startsAt || !endsAt) continue

    const startMs = new Date(startsAt).getTime()
    const endMs = new Date(endsAt).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue

    // Exact window match (±2 min) against an ITR appointment → skip echo.
    const matchesItr = itrWindows.some((w) => (
      Math.abs(w.startMs - startMs) <= 120_000
      && Math.abs(w.endMs - endMs) <= 120_000
    ))
    if (matchesItr) continue

    rows.push({
      owner_id: opts.ownerId,
      connection_id: opts.connectionId,
      external_event_id: event.id,
      starts_at: startsAt,
      ends_at: endsAt,
      is_all_day: Boolean(event.start?.date && !event.start?.dateTime),
      busy_status: 'busy',
      synced_at: syncedAt,
    })
  }

  await admin.from('external_calendar_blocks')
    .delete()
    .eq('connection_id', opts.connectionId)
    .gte('starts_at', timeMin)

  if (rows.length) {
    const { error } = await admin.from('external_calendar_blocks').insert(rows)
    if (error) throw error
  }

  return rows.length
}
