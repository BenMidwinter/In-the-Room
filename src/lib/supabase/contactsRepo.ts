import { getSupabase } from './client'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import type { Json } from './database.types'

const ROLES = ['parent', 'guardian', 'referrer', 'gp', 'school', 'billing', 'other'] as const

export type ContactRole = (typeof ROLES)[number]

export type AppContact = {
  id: string
  clientId: string
  name: string
  email: string
  phone: string
  role: ContactRole
  sendInvoices: boolean
}

type ContactRow = {
  id: string
  client_id: string
  role: string
  is_billing_contact: boolean
  encrypted_payload: Json
}

function roleOf(value: string): ContactRole {
  return ROLES.includes(value as ContactRole) ? value as ContactRole : 'other'
}

function parsePayload(raw: Json): { name: string; email: string; phone: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { name: '', email: '', phone: '' }
  const row = raw as Record<string, unknown>
  return {
    name: String(row.name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
  }
}

function mapContact(row: ContactRow): AppContact {
  const payload = parsePayload(row.encrypted_payload)
  return {
    id: row.id,
    clientId: row.client_id,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    role: roleOf(row.role),
    sendInvoices: Boolean(row.is_billing_contact),
  }
}

export async function listContacts(clientId?: string): Promise<AppContact[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase
    .from('contacts')
    .select('id, client_id, role, is_billing_contact, encrypted_payload, payload_format')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) throw error
  const rows = await withOpenedPayloads('contacts', (data || []) as ContactRow[])
  return rows.map(mapContact)
}

export async function saveContact(input: {
  id?: string
  clientId: string
  name: string
  email?: string
  phone?: string
  role?: string
  sendInvoices?: boolean
}): Promise<AppContact> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const name = input.name.trim()
  if (!name) throw new Error('Enter a name.')
  const email = String(input.email || '').trim()
  if (input.sendInvoices && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A contact who receives invoices needs an email address.')
  }
  const payload = {
    v: 0,
    name,
    email,
    phone: String(input.phone || '').trim(),
  }
  const role = roleOf(input.role || 'other')
  const billing = Boolean(input.sendInvoices)
  if (input.id) {
    await sealClinicalRecord('contacts', input.id, payload)
    const { error } = await supabase
      .from('contacts')
      .update({ role, is_billing_contact: billing })
      .eq('id', input.id)
      .eq('owner_id', user.id)
    if (error) throw error
    return mapContact({
      id: input.id,
      client_id: input.clientId,
      role,
      is_billing_contact: billing,
      encrypted_payload: payload as unknown as Json,
    })
  }
  const created = await createClinicalRecord('contacts', {
    client_id: input.clientId,
    role,
    is_billing_contact: billing,
    is_primary: false,
  }, payload)
  return mapContact({
    id: created.id,
    client_id: input.clientId,
    role,
    is_billing_contact: billing,
    encrypted_payload: payload as unknown as Json,
  })
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}
