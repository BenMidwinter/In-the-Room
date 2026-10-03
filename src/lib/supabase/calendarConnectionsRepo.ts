import { getSupabase } from './client'
import type { Tables } from './database.types'

export type CalendarConnection = Tables<'calendar_connections'>
export type CalendarFeedToken = Tables<'calendar_feed_tokens'>

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
