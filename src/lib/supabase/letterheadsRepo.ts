import { getSupabase } from './client'
import { writeAuditEvent } from './audit'

export type LetterheadRow = {
  id: string
  owner_id: string
  name: string
  practice_name: string | null
  logo_url: string | null
  address_line1: string | null
  address_line2: string | null
  address_line3: string | null
  postcode: string | null
  country: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export type LetterheadInput = {
  id?: string
  name: string
  practice_name?: string | null
  logo_url?: string | null
  address_line1?: string | null
  address_line2?: string | null
  address_line3?: string | null
  postcode?: string | null
  country?: string | null
  is_default?: boolean
}

export async function listLetterheads(): Promise<LetterheadRow[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('letterheads')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []) as LetterheadRow[]
}

export async function upsertLetterhead(input: LetterheadInput): Promise<LetterheadRow> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    owner_id: user.id,
    name: input.name.trim() || 'Letterhead',
    practice_name: input.practice_name?.trim() || null,
    logo_url: input.logo_url?.trim() || null,
    address_line1: input.address_line1?.trim() || null,
    address_line2: input.address_line2?.trim() || null,
    address_line3: input.address_line3?.trim() || null,
    postcode: input.postcode?.trim() || null,
    country: input.country?.trim() || null,
    is_default: Boolean(input.is_default),
  }

  const { data, error } = await supabase
    .from('letterheads')
    .upsert(payload)
    .select('*')
    .single()

  if (error) throw error

  if (payload.is_default) {
    await supabase
      .from('letterheads')
      .update({ is_default: false })
      .eq('owner_id', user.id)
      .neq('id', data.id)
  }

  await writeAuditEvent({
    action: input.id ? 'letterhead.updated' : 'letterhead.created',
    entityType: 'letterhead',
    entityId: data.id,
    metadata: { name: data.name },
  })

  return data as LetterheadRow
}

export async function deleteLetterhead(id: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { error } = await supabase.from('letterheads').delete().eq('id', id)
  if (error) throw error

  await writeAuditEvent({
    action: 'letterhead.deleted',
    entityType: 'letterhead',
    entityId: id,
  })
}
