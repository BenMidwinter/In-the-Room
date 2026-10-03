import { getSupabase } from './client'
import type { Tables } from './database.types'

export type CalendarConnection = Tables<'calendar_connections'>
export type CalendarFeedToken = Tables<'calendar_feed_tokens'>
export type ExternalCalendarBlock = Tables<'external_calendar_blocks'>

export type GoogleBusyBlock = {
  id: string
  client_id: null
  client_name: string
  episode_id: null
  clinician_id: string
  assigned_therapist: string
  session_date: string
  start_time: string
  end_time: string
  scheduled_at: string
  therapy_modality: 'external_busy'
  appointment_type: 'one_to_one'
  attendance_status: null
  location: string
  notes: string
  other_info: string
  created_at: string
  updated_at: string
  is_external_busy: true
  source: 'google'
  busy_status: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const [date, time = '00:00:00'] = String(iso).split('T')
    return { date, time: time.slice(0, 5) }
  }
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

export async function listCalendarConnections(): Promise<CalendarConnection[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('calendar_connections')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function listCalendarFeedTokens(): Promise<CalendarFeedToken[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/** Inbound Google busy blocks for the signed-in clinician. */
export async function listExternalCalendarBlocks(opts?: {
  fromIso?: string
  toIso?: string
}): Promise<ExternalCalendarBlock[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  let query = supabase
    .from('external_calendar_blocks')
    .select('*')
    .order('starts_at', { ascending: true })

  if (opts?.fromIso) query = query.gte('ends_at', opts.fromIso)
  if (opts?.toIso) query = query.lte('starts_at', opts.toIso)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/** Map Google busy rows into appointment-shaped items for the calendar grid. */
export function externalBlocksAsAppointments(
  blocks: ExternalCalendarBlock[],
  ownerId: string,
): GoogleBusyBlock[] {
  return blocks
    .filter((block) => block.busy_status !== 'free')
    .map((block) => {
      const start = localParts(block.starts_at)
      const end = localParts(block.ends_at)
      return {
        id: `ext-${block.id}`,
        client_id: null,
        client_name: 'Busy',
        episode_id: null,
        clinician_id: ownerId,
        assigned_therapist: 'External',
        session_date: start.date,
        start_time: start.time,
        end_time: end.time,
        scheduled_at: `${start.date}T${start.time}:00`,
        therapy_modality: 'external_busy' as const,
        appointment_type: 'one_to_one' as const,
        attendance_status: null,
        location: '',
        notes: '',
        other_info: '',
        created_at: block.created_at.slice(0, 10),
        updated_at: block.updated_at.slice(0, 10),
        is_external_busy: true as const,
        source: 'google' as const,
        busy_status: block.busy_status,
      }
    })
}
