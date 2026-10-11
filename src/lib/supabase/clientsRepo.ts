import { getSupabase, isSupabaseConfigured } from './client'
import { writeAuditEvent } from './audit'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import type { Json } from './database.types'
import type { ClinicalProfile } from '../clinicalProfile'
import { db } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { filterClientsForUser, type Client } from '../permissions'
import type { ClientConcession } from '../sessionPrice'

/** Transitional identity blob until client-side encryption is wired. */
type IdentityPayload = {
  v: 0
  first_name: string
  surname: string
  dob: string
  school?: string
  diagnosis?: string
  medication?: string
  gender?: string
  email?: string
}

type PseudonymPayload = {
  v: 0
  label: string
  concession_label?: string
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
  gender: string
  email: string
  clinical_profile?: ClinicalProfile
  concession_kind: string
  concession_percent: number | null
  concession_pence: number | null
  concession_label: string
  is_active: boolean
  on_screener: boolean
  on_waitlist: boolean
  status: string
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
  gender?: string
  email?: string
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
    gender: String(row.gender || ''),
    email: String(row.email || ''),
  }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function toAppClient(row: {
  id: string
  owner_id: string
  organization_id: string | null
  status: string
  created_at: string
  updated_at?: string
  concession_kind?: string | null
  concession_percent?: number | null
  concession_pence?: number | null
  concession_label?: string | null
  client_identities?: { encrypted_payload: Json } | { encrypted_payload: Json }[] | null
}, extras?: { concessionLabel?: string; clinicalProfile?: ClinicalProfile }): AppClientRecord {
  const identityRow = one(row.client_identities)
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
    gender: identity.gender || '',
    email: identity.email || '',
    clinical_profile: extras?.clinicalProfile,
    concession_kind: row.concession_kind || 'none',
    concession_percent: row.concession_percent ?? null,
    concession_pence: row.concession_pence ?? null,
    concession_label: extras?.concessionLabel ?? row.concession_label ?? '',
    is_active: row.status === 'active',
    on_screener: row.status === 'screener',
    on_waitlist: row.status === 'waitlist',
    status: row.status,
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
    .select('id, owner_id, organization_id, status, concession_kind, concession_percent, concession_pence, concession_label, payload_format, encrypted_pseudonym, created_at, updated_at, client_identities(encrypted_payload, payload_format), client_clinical_profiles(encrypted_payload, payload_format)')
    .order('created_at', { ascending: false })

  if (error) throw error
  const rows = data || []
  const identityRows = rows.flatMap((row) => {
    const identity = one(row.client_identities)
    return identity ? [{ id: row.id, payload_format: identity.payload_format, encrypted_payload: identity.encrypted_payload }] : []
  })
  const profileRows = rows.flatMap((row) => {
    const profile = one(row.client_clinical_profiles)
    return profile ? [{ id: row.id, payload_format: profile.payload_format, encrypted_payload: profile.encrypted_payload }] : []
  })
  const [openedClients, openedIdentities, openedProfiles] = await Promise.all([
    withOpenedPayloads('clients', rows.map((row) => ({
      id: row.id,
      payload_format: row.payload_format,
      encrypted_payload: row.encrypted_pseudonym ?? {},
    }))),
    withOpenedPayloads('client_identities', identityRows),
    withOpenedPayloads('client_clinical_profiles', profileRows),
  ])
  const identityByClient = new Map(openedIdentities.map((row) => [row.id, row.encrypted_payload]))
  const profileByClient = new Map(openedProfiles.map((row) => [row.id, row.encrypted_payload]))
  const pseudoByClient = new Map(openedClients.map((row) => [row.id, row]))
  return rows.map((row) => {
    const pseudo = pseudoByClient.get(row.id)
    const pseudoBody = pseudo && typeof pseudo.encrypted_payload === 'object' && pseudo.encrypted_payload
      ? pseudo.encrypted_payload as Record<string, unknown>
      : {}
    const profileBody = profileByClient.get(row.id)
    const clinicalProfile = profileBody && typeof profileBody === 'object' && !Array.isArray(profileBody)
      ? profileBody as ClinicalProfile
      : undefined
    return toAppClient({
      ...row,
      client_identities: { encrypted_payload: identityByClient.get(row.id) || {} },
    }, {
      concessionLabel: pseudo?.payload_format === 'envelope'
        ? String(pseudoBody.concession_label || '')
        : row.concession_label || '',
      clinicalProfile,
    })
  })
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
  _userId: string,
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
    gender: input.gender?.trim() || '',
    email: input.email?.trim() || '',
  }
  const clientColumns = 'id, owner_id, organization_id, status, concession_kind, concession_percent, concession_pence, concession_label, created_at, updated_at'

  if (input.id) {
    const keptLabel = await concessionWords(input.id)
    const pseudonym = pseudonymFor(firstName, surname, keptLabel)
    await sealClinicalRecord('clients', input.id, pseudonym)
    const { data: existingIdentity, error: existingError } = await supabase
      .from('client_identities')
      .select('client_id')
      .eq('client_id', input.id)
      .maybeSingle()
    if (existingError) throw existingError
    if (existingIdentity) await sealClinicalRecord('client_identities', input.id, identity)
    else await createClinicalRecord('client_identities', { client_id: input.id }, identity)

    const { data: clientRow, error: clientError } = await supabase
      .from('clients')
      .select(clientColumns)
      .eq('id', input.id)
      .single()
    if (clientError) throw clientError

    await writeAuditEvent({
      action: 'client.updated',
      entityType: 'client',
      entityId: input.id,
      clientId: input.id,
    })

    const mapped = toAppClient({
      ...clientRow,
      client_identities: { encrypted_payload: identity as unknown as Json },
    }, { concessionLabel: keptLabel })
    hydrateLocal([mapped])
    return mapped
  }

  const pseudonym = pseudonymFor(firstName, surname, '')
  const created = await createClinicalRecord('clients', { status: 'active' }, pseudonym)
  try {
    await createClinicalRecord('client_identities', { client_id: created.id }, identity)
  } catch (err) {
    await supabase.from('clients').delete().eq('id', created.id)
    throw err
  }

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .select(clientColumns)
    .eq('id', created.id)
    .single()
  if (clientError) throw clientError

  await writeAuditEvent({
    action: 'client.created',
    entityType: 'client',
    entityId: clientRow.id,
    clientId: clientRow.id,
  })

  const mapped = toAppClient({
    ...clientRow,
    client_identities: { encrypted_payload: identity as unknown as Json },
  }, { concessionLabel: '' })
  hydrateLocal([mapped])
  return mapped
}

function pseudonymFor(firstName: string, surname: string, concessionLabel: string): PseudonymPayload {
  return {
    v: 0,
    label: `${firstName} ${surname.charAt(0)}.`.trim(),
    concession_label: concessionLabel,
  }
}

async function concessionWords(clientId: string): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) return ''
  const { data, error } = await supabase
    .from('clients')
    .select('payload_format, encrypted_pseudonym, concession_label')
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return ''
  if (data.payload_format !== 'envelope') return data.concession_label || ''
  const [opened] = await withOpenedPayloads('clients', [{
    id: clientId,
    payload_format: data.payload_format,
    encrypted_payload: data.encrypted_pseudonym ?? {},
  }])
  const body = opened?.encrypted_payload
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  return String((body as Record<string, unknown>).concession_label || '')
}

export async function patchClientIdentity(
  clientId: string,
  patch: { gender?: string; school?: string; diagnosis?: string; medication?: string },
): Promise<AppClientRecord> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .select('id, owner_id, organization_id, status, concession_kind, concession_percent, concession_pence, concession_label, created_at, updated_at')
    .eq('id', clientId)
    .single()
  if (clientError) throw clientError

  const { data: identityRow, error: identityError } = await supabase
    .from('client_identities')
    .select('encrypted_payload, payload_format, organization_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (identityError) throw identityError

  const [openedIdentity] = identityRow
    ? await withOpenedPayloads('client_identities', [{
      id: clientId,
      payload_format: identityRow.payload_format,
      encrypted_payload: identityRow.encrypted_payload,
    }])
    : []
  const current = parseIdentity(openedIdentity?.encrypted_payload ?? identityRow?.encrypted_payload)
  const identity: IdentityPayload = {
    ...current,
    v: 0,
    gender: patch.gender !== undefined ? patch.gender.trim() : (current.gender || ''),
    school: patch.school !== undefined ? patch.school.trim() : (current.school || ''),
    diagnosis: patch.diagnosis !== undefined ? patch.diagnosis : (current.diagnosis || ''),
    medication: patch.medication !== undefined ? patch.medication.trim() : (current.medication || ''),
  }

  if (identityRow) await sealClinicalRecord('client_identities', clientId, identity)
  else await createClinicalRecord('client_identities', { client_id: clientId }, identity)

  await writeAuditEvent({
    action: 'client.updated',
    entityType: 'client',
    entityId: clientId,
    clientId,
  })

  const mapped = toAppClient({
    ...clientRow,
    client_identities: { encrypted_payload: identity as unknown as Json },
  })
  hydrateLocal([mapped])
  return mapped
}

export async function saveClientConcession(clientId: string, concession: ClientConcession): Promise<ClientConcession> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const kind = concession.kind
  const percent = kind === 'percent' ? Math.trunc(Number(concession.percent)) : null
  const amount = kind === 'amount' ? Math.trunc(Number(concession.amountPence)) : null
  if (kind === 'percent' && (!percent || percent < 1 || percent > 100)) {
    throw new Error('Enter a percentage from 1 to 100.')
  }
  if (kind === 'amount' && (!amount || amount < 1)) {
    throw new Error('Enter an amount off.')
  }
  const saved: ClientConcession = {
    kind,
    percent: kind === 'percent' ? percent : null,
    amountPence: kind === 'amount' ? amount : null,
    label: kind === 'none' ? '' : concession.label.trim(),
  }
  const { data: current, error: readError } = await supabase
    .from('clients')
    .select('payload_format, encrypted_pseudonym')
    .eq('id', clientId)
    .single()
  if (readError) throw readError
  const [opened] = await withOpenedPayloads('clients', [{
    id: clientId,
    payload_format: current.payload_format,
    encrypted_payload: current.encrypted_pseudonym ?? {},
  }])
  const body = opened?.encrypted_payload && typeof opened.encrypted_payload === 'object' && !Array.isArray(opened.encrypted_payload)
    ? opened.encrypted_payload as Record<string, unknown>
    : {}
  await sealClinicalRecord('clients', clientId, {
    ...body,
    v: 0,
    label: String(body.label || ''),
    concession_label: saved.label,
  })
  const { error } = await supabase
    .from('clients')
    .update({
      concession_kind: saved.kind,
      concession_percent: saved.percent,
      concession_pence: saved.amountPence,
    })
    .eq('id', clientId)
  if (error) throw error
  const idx = db.clients.findIndex((row) => row.id === clientId)
  if (idx !== -1) {
    db.clients[idx] = {
      ...db.clients[idx],
      concession_kind: saved.kind,
      concession_percent: saved.percent,
      concession_pence: saved.amountPence,
      concession_label: saved.label,
    } as StoreRecord
  }
  return saved
}

export async function saveClinicalProfile(clientId: string, profile: ClinicalProfile): Promise<ClinicalProfile> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const payload = { v: 0, ...profile }
  const { data: existing, error } = await supabase
    .from('client_clinical_profiles')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  if (existing) await sealClinicalRecord('client_clinical_profiles', clientId, payload)
  else await createClinicalRecord('client_clinical_profiles', { client_id: clientId }, payload)
  const idx = db.clients.findIndex((row) => row.id === clientId)
  if (idx !== -1) {
    db.clients[idx] = { ...db.clients[idx], clinical_profile: profile } as StoreRecord
  }
  return profile
}

export async function promoteWaitlistClient(clientId: string): Promise<void> {
  if (!clientId) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from('clients')
    .update({ status: 'active' })
    .eq('id', clientId)
    .eq('status', 'waitlist')
  if (error) throw error
  const idx = db.clients.findIndex((row) => row.id === clientId)
  if (idx !== -1) {
    const current = db.clients[idx] as { on_waitlist?: boolean }
    if (current.on_waitlist) {
      db.clients[idx] = {
        ...db.clients[idx],
        is_active: true,
        on_waitlist: false,
        on_screener: false,
        status: 'active',
      } as StoreRecord
    }
  }
}

export async function acceptWaitlistClient(clientId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase
    .from('clients')
    .update({ status: 'active' })
    .eq('id', clientId)
    .eq('status', 'waitlist')
  if (error) throw error
  const idx = db.clients.findIndex((row) => row.id === clientId)
  if (idx !== -1) {
    db.clients[idx] = { ...db.clients[idx], is_active: true, on_waitlist: false } as StoreRecord
  }
}
