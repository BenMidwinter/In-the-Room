import { getSupabase, isSupabaseConfigured } from './client'
import { writeAuditEvent } from './audit'
import type { Json } from './database.types'
import { db } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { filterClientsForUser, type Client } from '../permissions'

/** Transitional identity blob until client-side encryption is wired. */
type IdentityPayload = {
  v: 0
  first_name: string
  surname: string
  dob: string
  school?: string
  diagnosis?: string
  medication?: string
}

export type AppClientRecord = {
  id: string
  user_id: string
  workplace_id: string | null
  workplace_name: string
  first_name: string
  surname: string
  real_name: string
  dob: string
  school: string
  diagnosis: string
  medication: string
  is_active: boolean
  created_at: string
  updated_at?: string
}

export type ClientWriteInput = {
  id?: string
  first_name: string
  surname: string
  dob: string
  school?: string
  diagnosis?: string
  medication?: string
  workplace_id?: string | null
}

function parseIdentity(raw: Json | null | undefined): IdentityPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { v: 0, first_name: '', surname: '', dob: '' }
  }
  const row = raw as Record<string, unknown>
  return {
    v: 0,
    first_name: String(row.first_name || ''),
    surname: String(row.surname || ''),
    dob: String(row.dob || ''),
    school: String(row.school || ''),
    diagnosis: String(row.diagnosis || ''),
    medication: String(row.medication || ''),
  }
}

function toAppClient(row: {
  id: string
  owner_id: string
  organization_id: string | null
  status: string
  created_at: string
  updated_at?: string
  client_identities?: { encrypted_payload: Json } | { encrypted_payload: Json }[] | null
}): AppClientRecord {
  const identityRow = Array.isArray(row.client_identities)
    ? row.client_identities[0]
    : row.client_identities
  const identity = parseIdentity(identityRow?.encrypted_payload)
  const realName = `${identity.first_name} ${identity.surname}`.trim()
  return {
    id: row.id,
    user_id: row.owner_id,
    workplace_id: row.organization_id,
    workplace_name: row.organization_id ? 'Workplace' : 'Private Practice',
    first_name: identity.first_name,
    surname: identity.surname,
    real_name: realName || 'Client',
    dob: identity.dob,
    school: identity.school || '',
    diagnosis: identity.diagnosis || '',
    medication: identity.medication || '',
    is_active: row.status === 'active',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function hydrateLocal(clients: AppClientRecord[]) {
  for (const client of clients) {
    const idx = db.clients.findIndex((row) => row.id === client.id)
    if (idx === -1) db.clients.push(client as unknown as StoreRecord)
    else db.clients[idx] = { ...db.clients[idx], ...client } as StoreRecord
  }
}

export async function listClientsFromSupabase(): Promise<AppClientRecord[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('clients')
    .select('id, owner_id, organization_id, status, created_at, updated_at, client_identities(encrypted_payload)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toAppClient(row as Parameters<typeof toAppClient>[0]))
}

export async function fetchClientsForUser(
  userId: string,
  myWorkplace: unknown,
): Promise<AppClientRecord[]> {
  if (!isSupabaseConfigured()) {
    return filterClientsForUser(db.clients as Client[], userId, myWorkplace as never) as AppClientRecord[]
  }

  const remote = await listClientsFromSupabase()
  hydrateLocal(remote)
  return filterClientsForUser(remote as Client[], userId, myWorkplace as never) as AppClientRecord[]
}

export async function upsertClientRemote(
  input: ClientWriteInput,
  userId: string,
): Promise<AppClientRecord> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const firstName = input.first_name.trim()
  const surname = input.surname.trim()
  const identity: IdentityPayload = {
    v: 0,
    first_name: firstName,
    surname,
    dob: input.dob,
    school: input.school?.trim() || '',
    diagnosis: input.diagnosis || '',
    medication: input.medication?.trim() || '',
  }
  const organizationId = input.workplace_id || null
  const pseudonym = {
    v: 0,
    label: `${firstName} ${surname.charAt(0)}.`.trim(),
  }

  if (input.id) {
    const { data: clientRow, error: clientError } = await supabase
      .from('clients')
      .update({
        organization_id: organizationId,
        status: 'active',
        encrypted_pseudonym: pseudonym as unknown as Json,
      })
      .eq('id', input.id)
      .select('id, owner_id, organization_id, status, created_at, updated_at')
      .single()
    if (clientError) throw clientError

    const { error: identityError } = await supabase
      .from('client_identities')
      .upsert({
        client_id: input.id,
        owner_id: userId,
        organization_id: organizationId,
        encrypted_payload: identity as unknown as Json,
      })
    if (identityError) throw identityError

    await writeAuditEvent({
      action: 'client.updated',
      entityType: 'client',
      entityId: input.id,
      clientId: input.id,
    })

    const mapped = toAppClient({
      ...clientRow,
      client_identities: { encrypted_payload: identity as unknown as Json },
    })
    hydrateLocal([mapped])
    return mapped
  }

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .insert({
      owner_id: userId,
      organization_id: organizationId,
      status: 'active',
      encrypted_pseudonym: pseudonym as unknown as Json,
    })
    .select('id, owner_id, organization_id, status, created_at, updated_at')
    .single()
  if (clientError) throw clientError

  const { error: identityError } = await supabase
    .from('client_identities')
    .insert({
      client_id: clientRow.id,
      owner_id: userId,
      organization_id: organizationId,
      encrypted_payload: identity as unknown as Json,
    })
  if (identityError) {
    await supabase.from('clients').delete().eq('id', clientRow.id)
    throw identityError
  }

  await writeAuditEvent({
    action: 'client.created',
    entityType: 'client',
    entityId: clientRow.id,
    clientId: clientRow.id,
  })

  const mapped = toAppClient({
    ...clientRow,
    client_identities: { encrypted_payload: identity as unknown as Json },
  })
  hydrateLocal([mapped])
  return mapped
}
