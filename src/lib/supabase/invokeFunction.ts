import { getSupabase } from './client'

/** Invoke a Supabase Edge Function and surface the JSON error body when present. */
export async function invokeFunction<T = unknown>(
  name: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<T> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { data, error } = await supabase.functions.invoke(name, options)
  if (!error) return data as T

  let detail = error.message || `Edge Function ${name} failed`
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) detail = String(body.error)
      else if (body?.message) detail = String(body.message)
    } catch {
      /* keep generic message */
    }
  }
  throw new Error(detail)
}
