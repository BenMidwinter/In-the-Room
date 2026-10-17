import { workingDocumentInputSchema, parseOrThrow } from '../schemas'
import { db } from '../data/collections'
import { saveWorkingDocument } from '../store/clinicalDocs'
import type { StoreRecord } from '../types/collections'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

const COLUMNS = 'id, client_id, author_id, encrypted_payload, payload_format, created_at, updated_at, archived_at'

type DocumentRow = {
  id: string
  client_id: string
  author_id: string
  encrypted_payload: Json
  payload_format?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
}

export type AppWorkingDocument = {
  id: string
  client_id: string
  author_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  archived_at?: string | null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toDocument(row: DocumentRow): AppWorkingDocument {
  const body = row.encrypted_payload && typeof row.encrypted_payload === 'object' && !Array.isArray(row.encrypted_payload)
    ? row.encrypted_payload as { title?: unknown; content?: unknown }
    : {}
  return {
    id: row.id,
    client_id: row.client_id,
    author_id: row.author_id,
    title: String(body.title || 'Untitled document'),
    content: typeof body.content === 'string' && body.content.trim() ? body.content : '<p></p>',
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
  }
}

function remember(document: AppWorkingDocument): AppWorkingDocument {
  const idx = db.workingDocuments.findIndex((row) => row.id === document.id)
  if (idx === -1) db.workingDocuments.push(document as unknown as StoreRecord)
  else db.workingDocuments[idx] = { ...db.workingDocuments[idx], ...document } as StoreRecord
  return db.workingDocuments[idx === -1 ? db.workingDocuments.length - 1 : idx] as unknown as AppWorkingDocument
}

function localDocuments(clientId: string): AppWorkingDocument[] {
  return db.workingDocuments
    .filter((row) => row.client_id === clientId)
    .map((row) => row as unknown as AppWorkingDocument)
    .sort((a, b) => new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime())
}

export async function listWorkingDocuments(clientId: string): Promise<AppWorkingDocument[]> {
  if (!clientId || !isSupabaseConfigured() || !isUuid(clientId)) return localDocuments(clientId)
  const supabase = getSupabase()
  if (!supabase) return localDocuments(clientId)
  const { data, error } = await supabase
    .from('working_documents')
    .select(COLUMNS)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const rows = await withOpenedPayloads('working_documents', (data || []) as DocumentRow[])
  return rows.map((row) => remember(toDocument(row)))
}

export async function saveWorkingDocumentForUser(payload: Record<string, unknown>, userId: string): Promise<AppWorkingDocument> {
  const parsed = parseOrThrow(workingDocumentInputSchema, payload, 'Document') as Record<string, unknown>
  const title = String(parsed.title || 'Untitled document')
  const content = String(parsed.content || '<p></p>')
  const clientId = String(parsed.client_id || '')
  const existingId = isUuid(parsed.id) ? String(parsed.id) : null
  const localOnly = !isSupabaseConfigured() || (parsed.id ? !existingId : !isUuid(clientId))
  if (localOnly) {
    return saveWorkingDocument({
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      client_id: clientId,
      title,
      content,
    }, userId) as AppWorkingDocument
  }
  const body = { v: 0, title, content }
  if (existingId) {
    await sealClinicalRecord('working_documents', existingId, body)
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase is not configured')
    const { data, error } = await supabase.from('working_documents').select(COLUMNS).eq('id', existingId).single()
    if (error) throw error
    return remember(toDocument({ ...(data as DocumentRow), encrypted_payload: body as unknown as Json, payload_format: 'envelope' }))
  }
  const created = await createClinicalRecord('working_documents', { client_id: clientId }, body)
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('working_documents').select(COLUMNS).eq('id', created.id).single()
  if (error) throw error
  return remember(toDocument({ ...(data as DocumentRow), encrypted_payload: body as unknown as Json, payload_format: 'envelope' }))
}

export async function setWorkingDocumentArchived(id: string, archived: boolean): Promise<AppWorkingDocument> {
  if (!id) throw new Error('Document not found')
  const archivedAt = archived ? new Date().toISOString() : null
  if (!isSupabaseConfigured() || !isUuid(id)) {
    const idx = db.workingDocuments.findIndex((row) => row.id === id)
    if (idx === -1) throw new Error('Document not found')
    db.workingDocuments[idx] = { ...db.workingDocuments[idx], archived_at: archivedAt } as StoreRecord
    return db.workingDocuments[idx] as unknown as AppWorkingDocument
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('working_documents')
    .update({ archived_at: archivedAt })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  const [opened] = await withOpenedPayloads('working_documents', [data as DocumentRow])
  return remember(toDocument(opened))
}

export async function deleteWorkingDocument(id: string): Promise<void> {
  if (!id) return
  if (!isSupabaseConfigured() || !isUuid(id)) {
    const idx = db.workingDocuments.findIndex((row) => row.id === id)
    if (idx !== -1) db.workingDocuments.splice(idx, 1)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('working_documents').delete().eq('id', id)
  if (error) throw error
  const idx = db.workingDocuments.findIndex((row) => row.id === id)
  if (idx !== -1) db.workingDocuments.splice(idx, 1)
}
