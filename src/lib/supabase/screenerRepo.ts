import { getSupabase } from './client'
import type { Json } from './database.types'

export type TagKind = 'client' | 'waitlist'

export const TAG_COLOURS = [
  { value: '#c45c4a', label: 'Red' },
  { value: '#d4a017', label: 'Gold' },
  { value: '#3d7a5a', label: 'Green' },
  { value: '#3d6f8f', label: 'Blue' },
  { value: '#6b5b95', label: 'Purple' },
  { value: '#8a6a4f', label: 'Brown' },
  { value: '#5c6b73', label: 'Slate' },
] as const

const TAG_HEX = /^#[0-9a-f]{6}$/

export function tagColour(value: string | null | undefined): string {
  const normalised = String(value || '').trim().toLowerCase()
  if (TAG_HEX.test(normalised)) return normalised
  return TAG_COLOURS[6].value
}

export function tagColourLabel(value: string | null | undefined): string {
  const colour = tagColour(value)
  return TAG_COLOURS.find((row) => row.value === colour)?.label || 'Custom'
}

export type TagRecord = {
  id: string
  kind: TagKind
  name: string
  color: string
}

export type ScreenerPerson = {
  id: string
  name: string
  dob: string
  gender: string
  status: 'screener' | 'waitlist'
  createdAt: string
  submissionId: string | null
  formName: string
  preferredTimes: string
  information: string
  serviceId: string | null
  tagIds: string[]
}

type Identity = { first_name?: string; surname?: string; dob?: string; gender?: string }

function identityOf(raw: Json | null | undefined): Identity {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Identity
}

function supabaseOrThrow() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Sign in required')
  return supabase
}

export async function listTags(kind?: TagKind): Promise<TagRecord[]> {
  const supabase = supabaseOrThrow()
  let query = supabase.from('tags').select('id, kind, name, color').order('name')
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    kind: row.kind === 'waitlist' ? 'waitlist' : 'client',
    name: row.name,
    color: tagColour(row.color),
  }))
}

export async function createTag(kind: TagKind, name: string, color: string): Promise<TagRecord> {
  const supabase = supabaseOrThrow()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name the tag.')
  const chosen = tagColour(color)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data, error } = await supabase
    .from('tags')
    .insert({ owner_id: user.id, kind, name: trimmed, color: chosen })
    .select('id, kind, name, color')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That tag is already in the list.')
    throw error
  }
  return {
    id: data.id,
    kind: data.kind === 'waitlist' ? 'waitlist' : 'client',
    name: data.name,
    color: tagColour(data.color),
  }
}

export async function deleteTag(id: string): Promise<void> {
  const supabase = supabaseOrThrow()
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) throw error
}

export async function listScreenerBoard(): Promise<ScreenerPerson[]> {
  const supabase = supabaseOrThrow()
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, status, created_at, client_identities(encrypted_payload)')
    .in('status', ['screener', 'waitlist'])
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = clients || []
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)

  const [submissionsRes, placementsRes, linksRes] = await Promise.all([
    supabase
      .from('form_submissions')
      .select('id, client_id, submitted_at, form_definitions(name)')
      .in('client_id', ids)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true }),
    supabase
      .from('waitlist_placements')
      .select('client_id, preferred_times, information, service_id')
      .in('client_id', ids),
    supabase
      .from('client_tag_links')
      .select('client_id, tag_id, tags(kind)')
      .in('client_id', ids),
  ])
  if (submissionsRes.error) throw submissionsRes.error
  if (placementsRes.error) throw placementsRes.error
  if (linksRes.error) throw linksRes.error

  const formByClient = new Map<string, { id: string; name: string }>()
  for (const row of submissionsRes.data || []) {
    if (!row.client_id || formByClient.has(row.client_id)) continue
    const definition = Array.isArray(row.form_definitions) ? row.form_definitions[0] : row.form_definitions
    formByClient.set(row.client_id, { id: row.id, name: definition?.name || 'Form' })
  }
  const placementByClient = new Map((placementsRes.data || []).map((row) => [row.client_id, row]))
  const tagsByClient = new Map<string, string[]>()
  for (const row of linksRes.data || []) {
    const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags
    if (tag?.kind !== 'waitlist') continue
    const list = tagsByClient.get(row.client_id) || []
    list.push(row.tag_id)
    tagsByClient.set(row.client_id, list)
  }

  return rows.map((row) => {
    const identityRow = Array.isArray(row.client_identities) ? row.client_identities[0] : row.client_identities
    const identity = identityOf(identityRow?.encrypted_payload)
    const name = `${identity.first_name || ''} ${identity.surname || ''}`.trim() || 'New referral'
    const form = formByClient.get(row.id)
    const placement = placementByClient.get(row.id)
    return {
      id: row.id,
      name,
      dob: String(identity.dob || ''),
      gender: String(identity.gender || ''),
      status: row.status === 'waitlist' ? 'waitlist' : 'screener',
      createdAt: row.created_at,
      submissionId: form?.id || null,
      formName: form?.name || '',
      preferredTimes: placement?.preferred_times || '',
      information: placement?.information || '',
      serviceId: placement?.service_id || null,
      tagIds: tagsByClient.get(row.id) || [],
    }
  })
}

export async function saveWaitlistPlacement(input: {
  clientId: string
  preferredTimes: string
  information: string
  serviceId: string | null
  tagIds: string[]
  accept: boolean
}): Promise<void> {
  const supabase = supabaseOrThrow()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  if (input.accept) {
    const { error } = await supabase
      .from('clients')
      .update({ status: 'waitlist' })
      .eq('id', input.clientId)
      .eq('status', 'screener')
    if (error) throw error
  }

  const { error: placeError } = await supabase
    .from('waitlist_placements')
    .upsert({
      client_id: input.clientId,
      owner_id: user.id,
      preferred_times: input.preferredTimes.trim(),
      information: input.information.trim(),
      service_id: input.serviceId || null,
    })
  if (placeError) throw placeError

  const { data: owned, error: tagError } = await supabase.from('tags').select('id').eq('kind', 'waitlist')
  if (tagError) throw tagError
  const ownedIds = (owned || []).map((row) => row.id)
  if (ownedIds.length) {
    const { error } = await supabase
      .from('client_tag_links')
      .delete()
      .eq('client_id', input.clientId)
      .in('tag_id', ownedIds)
    if (error) throw error
  }
  const tagIds = input.tagIds.filter((id) => ownedIds.includes(id))
  if (tagIds.length) {
    const { error } = await supabase
      .from('client_tag_links')
      .insert(tagIds.map((tagId) => ({ client_id: input.clientId, tag_id: tagId })))
    if (error) throw error
  }
}

export async function rejectScreenerClient(clientId: string): Promise<void> {
  const supabase = supabaseOrThrow()
  const { error } = await supabase
    .from('clients')
    .update({ status: 'rejected' })
    .eq('id', clientId)
    .eq('status', 'screener')
  if (error) throw error
}
