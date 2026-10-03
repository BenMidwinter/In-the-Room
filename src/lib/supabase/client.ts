import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined

let client: SupabaseClient<Database> | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey)
}

/** Browser Supabase client (publishable/anon key). Null when env is missing. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient<Database>(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
