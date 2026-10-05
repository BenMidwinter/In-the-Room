import { getSupabase } from './client'
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
    .select('id, client_id, role, is_billing_contact, encrypted_payload')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) throw error
  return ((data || []) as ContactRow[]).map(mapContact)
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
  const row = {
    owner_id: user.id,
    client_id: input.clientId,
    role: roleOf(input.role || 'other'),
    is_billing_contact: Boolean(input.sendInvoices),
    encrypted_payload: payload as unknown as Json,
  }
  const query = input.id
    ? supabase.from('contacts').update(row).eq('id', input.id).eq('owner_id', user.id)
    : supabase.from('contacts').insert(row)
  const { data, error } = await query
    .select('id, client_id, role, is_billing_contact, encrypted_payload')
    .single()
  if (error) throw error
  return mapContact(data as ContactRow)
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}
