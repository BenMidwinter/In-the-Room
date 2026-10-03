import { getSupabase } from './client'

/** Create a Google Meet link for an appointment when the connection + service allow it. */
export async function createMeetForAppointment(input: {
  appointmentId: string
  startsAt: string
  endsAt: string
  summary?: string
}): Promise<{ meetUrl: string | null; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) return { meetUrl: null, error: 'Supabase not configured' }

  const { data, error } = await supabase.functions.invoke('google-calendar-meet', {
    body: { action: 'create', ...input },
  })

  if (error) return { meetUrl: null, error: error.message }
  if (data?.error) return { meetUrl: null, error: data.error }
  return { meetUrl: data?.meetUrl ?? null }
}

/**
 * Delete linked Google Calendar events for the given In the Room appointments.
 * Best-effort — ITR delete still proceeds if Google is unavailable.
 */
export async function deleteGoogleEventsForAppointments(
  appointmentIds: string[],
): Promise<{ deleted: number; error?: string }> {
  const ids = [...new Set(appointmentIds.filter(Boolean))]
  if (!ids.length) return { deleted: 0 }

  const supabase = getSupabase()
  if (!supabase) return { deleted: 0, error: 'Supabase not configured' }

  const { data, error } = await supabase.functions.invoke('google-calendar-meet', {
    body: { action: 'delete', appointmentIds: ids },
  })

  if (error) return { deleted: 0, error: error.message }
  if (data?.error) return { deleted: 0, error: data.error }
  return { deleted: Number(data?.deleted || 0) }
}
