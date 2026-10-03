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
    body: input,
  })

  if (error) return { meetUrl: null, error: error.message }
  if (data?.error) return { meetUrl: null, error: data.error }
  return { meetUrl: data?.meetUrl ?? null }
}
