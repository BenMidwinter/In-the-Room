import { getSupabase } from './client'
import { writeAuditEvent } from './audit'
import type { Tables, TablesInsert, TablesUpdate } from './database.types'

export type ServiceRow = Tables<'services'>

export async function listServices(): Promise<ServiceRow[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getServiceById(id: string): Promise<ServiceRow | null> {
  const supabase = getSupabase()
  if (!supabase || !id) return null

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function upsertService(
  input: Omit<TablesInsert<'services'>, 'owner_id'> & { id?: string },
): Promise<ServiceRow> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const payload: TablesInsert<'services'> = {
    ...input,
    owner_id: user.id,
  }

  const { data, error } = await supabase
    .from('services')
    .upsert(payload)
    .select('*')
    .single()

  if (error) throw error

  await writeAuditEvent({
    action: input.id ? 'service.updated' : 'service.created',
    entityType: 'service',
    entityId: data.id,
    metadata: { slug: data.slug, service_type: data.service_type },
  })

  return data
}

export async function updateService(
  id: string,
  patch: TablesUpdate<'services'>,
): Promise<ServiceRow> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { data, error } = await supabase
    .from('services')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error

  await writeAuditEvent({
    action: 'service.updated',
    entityType: 'service',
    entityId: data.id,
    metadata: { slug: data.slug },
  })

  return data
}

export async function deleteService(id: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id)

  if (error) throw error

  await writeAuditEvent({
    action: 'service.deleted',
    entityType: 'service',
    entityId: id,
  })
}
