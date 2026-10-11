import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
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
  status: 'screener' | 'waitlist' | 'rejected'
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
  let query = supabase.from('tags').select('id, kind, name, color, payload_format, sealed_payload').order('name')
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error) throw error
  const rows = await withOpenedPayloads('tags', (data || []).map((row) => ({
    ...row,
    sealed_payload: row.sealed_payload ?? {},
  })), { payloadKey: 'sealed_payload' })
  return rows.map((row) => {
    const body = row.payload_format === 'envelope' && row.sealed_payload && typeof row.sealed_payload === 'object'
      ? row.sealed_payload as { name?: unknown }
      : null
    return {
      id: row.id,
      kind: row.kind === 'waitlist' ? 'waitlist' as const : 'client' as const,
      name: body ? String(body.name || '') : row.name,
      color: tagColour(row.color),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export async function createTag(kind: TagKind, name: string, color: string): Promise<TagRecord> {
  const supabase = supabaseOrThrow()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name the tag.')
  const chosen = tagColour(color)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const existing = await listTags(kind)
  if (existing.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('That tag is already in the list.')
  }
  const created = await createClinicalRecord('tags', {
    kind,
    name: crypto.randomUUID(),
    color: chosen,
  }, { v: 0, name: trimmed })
  return {
    id: created.id,
    kind,
    name: trimmed,
    color: chosen,
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
    .select('id, status, created_at, client_identities(encrypted_payload, payload_format)')
    .in('status', ['screener', 'waitlist', 'rejected'])
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = clients || []
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)

  const [submissionsRes, placementsRes, linksRes] = await Promise.all([
    supabase
      .from('form_submissions')
      .select('id, client_id, submitted_at, form_definitions(id, name, payload_format, sealed_payload)')
      .in('client_id', ids)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true }),
    supabase
      .from('waitlist_placements')
      .select('client_id, preferred_times, information, service_id, payload_format, sealed_payload')
      .in('client_id', ids),
    supabase
      .from('client_tag_links')
      .select('client_id, tag_id, tags(kind)')
      .in('client_id', ids),
  ])
  if (submissionsRes.error) throw submissionsRes.error
  if (placementsRes.error) throw placementsRes.error
  if (linksRes.error) throw linksRes.error

  const definitionRows = (submissionsRes.data || []).flatMap((row) => {
    const definition = Array.isArray(row.form_definitions) ? row.form_definitions[0] : row.form_definitions
    return definition?.id ? [{
      id: definition.id,
      payload_format: definition.payload_format,
      sealed_payload: definition.sealed_payload ?? {},
      name: definition.name,
    }] : []
  })
  const openedDefinitions = await withOpenedPayloads('form_definitions', definitionRows, { payloadKey: 'sealed_payload' })
  const definitionName = new Map(openedDefinitions.map((row) => {
    const body = row.payload_format === 'envelope' && row.sealed_payload && typeof row.sealed_payload === 'object'
      ? row.sealed_payload as { name?: unknown }
      : null
    return [row.id, body ? String(body.name || 'Form') : (row.name || 'Form')]
  }))
  const formByClient = new Map<string, { id: string; name: string }>()
  for (const row of submissionsRes.data || []) {
    if (!row.client_id || formByClient.has(row.client_id)) continue
    const definition = Array.isArray(row.form_definitions) ? row.form_definitions[0] : row.form_definitions
    formByClient.set(row.client_id, { id: row.id, name: definitionName.get(definition?.id || '') || definition?.name || 'Form' })
  }
  const identityRows = rows.flatMap((row) => {
    const identity = Array.isArray(row.client_identities) ? row.client_identities[0] : row.client_identities
    return identity ? [{ id: row.id, payload_format: identity.payload_format, encrypted_payload: identity.encrypted_payload }] : []
  })
  const openedIdentities = await withOpenedPayloads('client_identities', identityRows)
  const identityByClient = new Map(openedIdentities.map((row) => [row.id, row.encrypted_payload]))
  const openedPlacements = await withOpenedPayloads('waitlist_placements', (placementsRes.data || []).map((row) => ({
    id: row.client_id,
    payload_format: row.payload_format,
    sealed_payload: row.sealed_payload ?? {},
    preferred_times: row.preferred_times,
    information: row.information,
    service_id: row.service_id,
  })), { payloadKey: 'sealed_payload' })
  const placementByClient = new Map(openedPlacements.map((row) => [row.id, row]))
  const tagsByClient = new Map<string, string[]>()
  for (const row of linksRes.data || []) {
    const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags
    if (tag?.kind !== 'waitlist') continue
    const list = tagsByClient.get(row.client_id) || []
    list.push(row.tag_id)
    tagsByClient.set(row.client_id, list)
  }

  return rows.map((row) => {
    const identity = identityOf(identityByClient.get(row.id))
    const name = `${identity.first_name || ''} ${identity.surname || ''}`.trim() || 'New referral'
    const form = formByClient.get(row.id)
    const placement = placementByClient.get(row.id)
    const placementBody = placement?.payload_format === 'envelope' && placement.sealed_payload && typeof placement.sealed_payload === 'object'
      ? placement.sealed_payload as { preferred_times?: unknown; information?: unknown }
      : null
    return {
      id: row.id,
      name,
      dob: String(identity.dob || ''),
      gender: String(identity.gender || ''),
      status: row.status === 'waitlist' ? 'waitlist' : row.status === 'rejected' ? 'rejected' : 'screener',
      createdAt: row.created_at,
      submissionId: form?.id || null,
      formName: form?.name || '',
      preferredTimes: placementBody ? String(placementBody.preferred_times || '') : (placement?.preferred_times || ''),
      information: placementBody ? String(placementBody.information || '') : (placement?.information || ''),
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

  const placement = {
    v: 0,
    preferred_times: input.preferredTimes.trim(),
    information: input.information.trim(),
  }
  const { data: existingPlace, error: existingError } = await supabase
    .from('waitlist_placements')
    .select('client_id')
    .eq('client_id', input.clientId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existingPlace) {
    await sealClinicalRecord('waitlist_placements', input.clientId, placement)
    const { error: placeError } = await supabase
      .from('waitlist_placements')
      .update({ service_id: input.serviceId || null })
      .eq('client_id', input.clientId)
    if (placeError) throw placeError
  } else {
    await createClinicalRecord('waitlist_placements', {
      client_id: input.clientId,
      service_id: input.serviceId || null,
    }, placement)
  }

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

export async function moveClientToWaitlist(input: {
  clientId: string
  preferredTimes: string
  information: string
  serviceId: string | null
  tagIds: string[]
}): Promise<void> {
  const supabase = supabaseOrThrow()
  const { data: current, error: readError } = await supabase
    .from('clients')
    .select('status')
    .eq('id', input.clientId)
    .maybeSingle()
  if (readError) throw readError
  if (!current || (current.status !== 'active' && current.status !== 'inactive')) {
    throw new Error('Choose a client from your list.')
  }
  const { error } = await supabase
    .from('clients')
    .update({ status: 'waitlist' })
    .eq('id', input.clientId)
    .eq('status', current.status)
  if (error) throw error
  try {
    await saveWaitlistPlacement({
      clientId: input.clientId,
      preferredTimes: input.preferredTimes,
      information: input.information,
      serviceId: input.serviceId,
      tagIds: input.tagIds,
      accept: false,
    })
  } catch (err) {
    await supabase
      .from('clients')
      .update({ status: current.status })
      .eq('id', input.clientId)
      .eq('status', 'waitlist')
    throw err
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
