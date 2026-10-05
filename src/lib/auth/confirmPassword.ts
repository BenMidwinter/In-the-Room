import { getSupabase } from '../supabase/client'

/** Check the signed-in clinician's password again. Does not accept another account. */
export async function confirmCurrentPassword(password: string): Promise<void> {
  if (!password) throw new Error('Enter your password.')
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email
  const userId = session?.user?.id
  if (!email || !userId) throw new Error('Sign in required')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user || data.user.id !== userId) {
    if (session?.access_token && session.refresh_token && data?.user && data.user.id !== userId) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    }
    const invalid = !error || error.code === 'invalid_credentials' || /invalid login/i.test(error?.message || '')
    throw new Error(invalid ? 'That password does not match.' : error.message)
  }
}
