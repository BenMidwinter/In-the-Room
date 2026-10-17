import { type PracticeItem, type PracticeKind } from '../practiceItems'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { selectWithOptionalArchive, updateArchiveColumn } from './optionalArchive'

const PRACTICE_COLUMNS_BASE = 'id, parent_id, kind, name, encrypted_payload, payload_format, created_at, updated_at'
const PRACTICE_COLUMNS = `${PRACTICE_COLUMNS_BASE}, archived_at`

type PracticeRow = {
  id: string
  parent_id: string | null
  kind: string
  name: string
  encrypted_payload: Json | null
  payload_format?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
}

const localItems: PracticeItem[] = []

function contentFromPayload(payload: Json | null | undefined): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
  const content = (payload as { content?: unknown }).content
  return typeof content === 'string' ? content : ''
}

function toItem(row: PracticeRow): PracticeItem {
  const kind: PracticeKind = row.kind === 'folder' ? 'folder' : 'document'
  const body = row.encrypted_payload && typeof row.encrypted_payload === 'object' && !Array.isArray(row.encrypted_payload)
    ? row.encrypted_payload as { name?: unknown; content?: unknown }
    : {}
  const sealed = row.payload_format === 'envelope'
  return {
    id: row.id,
    parent_id: row.parent_id,
    kind,
    name: sealed ? String(body.name || row.name) : row.name,
    content: kind === 'folder'
      ? ''
      : sealed
        ? (typeof body.content === 'string' && body.content.trim() ? body.content : '<p></p>')
        : (contentFromPayload(row.encrypted_payload) || '<p></p>'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Add a name.')
  if (trimmed.length > 180) throw new Error('Use a shorter name.')
  return trimmed
}

function assertParent(parentId: string | null, kind: PracticeKind) {
  if (!parentId) return
  const parent = localItems.find((item) => item.id === parentId)
  if (!parent || parent.kind !== 'folder') {
    throw new Error('Practice items can only live inside a folder you own')
  }
  if (kind !== 'folder' && kind !== 'document') {
    throw new Error('Unknown practice item')
  }
}

function removeLocalTree(id: string) {
  const drop = new Set<string>()
  const walk = (current: string) => {
    drop.add(current)
    for (const item of localItems) {
      if (item.parent_id === current && !drop.has(item.id)) walk(item.id)
    }
  }
  walk(id)
  for (let index = localItems.length - 1; index >= 0; index -= 1) {
    if (drop.has(localItems[index].id)) localItems.splice(index, 1)
  }
}

export async function listPracticeItems(): Promise<PracticeItem[]> {
  if (!isSupabaseConfigured()) return localItems.map((item) => ({ ...item }))
  const supabase = getSupabase()
  if (!supabase) return localItems.map((item) => ({ ...item }))
  const data = await selectWithOptionalArchive(
    () => supabase.from('practice_items').select(PRACTICE_COLUMNS).order('name', { ascending: true }),
    () => supabase.from('practice_items').select(PRACTICE_COLUMNS_BASE).order('name', { ascending: true }),
  )
  const rows = await withOpenedPayloads('practice_items', data as PracticeRow[])
  return rows.map((row) => toItem(row)).sort((a, b) => a.name.localeCompare(b.name))
}

async function insertRemote(input: {
  parentId: string | null
  kind: PracticeKind
  name: string
  content: string
}): Promise<PracticeItem> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const encrypted_payload = {
    v: 0,
    name: input.name,
    content: input.kind === 'document' ? (input.content || '<p></p>') : '',
  } as unknown as Json
  const created = await createClinicalRecord('practice_items', {
    parent_id: input.parentId,
    kind: input.kind,
  }, encrypted_payload)
  const { data, error } = await supabase
    .from('practice_items')
    .select('id, parent_id, kind, name, encrypted_payload, payload_format, created_at, updated_at')
    .eq('id', created.id)
    .single()
  if (error) throw error
  return toItem({ ...(data as PracticeRow), encrypted_payload, payload_format: 'envelope' })
}

export async function createPracticeItem(input: {
  parentId?: string | null
  kind: PracticeKind
  name: string
  content?: string
}): Promise<PracticeItem> {
  const name = cleanName(input.name)
  const parentId = input.parentId || null
  const content = input.kind === 'document' ? (input.content || '<p></p>') : ''

  if (!isSupabaseConfigured()) {
    assertParent(parentId, input.kind)
    const now = new Date().toISOString()
    const created: PracticeItem = {
      id: `local-${crypto.randomUUID()}`,
      parent_id: parentId,
      kind: input.kind,
      name,
      content,
      created_at: now,
      updated_at: now,
    }
    localItems.push(created)
    return { ...created }
  }

  return insertRemote({ parentId, kind: input.kind, name, content })
}

export async function savePracticeDocument(input: {
  id?: string | null
  parentId?: string | null
  name: string
  content: string
}): Promise<PracticeItem> {
  const name = cleanName(input.name)
  const content = input.content || '<p></p>'
  const existingId = input.id && input.id !== 'new' ? input.id : null

  if (!existingId) {
    return createPracticeItem({
      parentId: input.parentId,
      kind: 'document',
      name,
      content,
    })
  }

  if (!isSupabaseConfigured()) {
    const current = localItems.find((item) => item.id === existingId)
    if (!current || current.kind !== 'document') throw new Error('Document not found')
    current.name = name
    current.content = content
    current.updated_at = new Date().toISOString()
    return { ...current }
  }

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const encrypted_payload = { v: 0, name, content } as unknown as Json
  await sealClinicalRecord('practice_items', existingId, encrypted_payload)
  const { data, error } = await supabase
    .from('practice_items')
    .select('id, parent_id, kind, name, encrypted_payload, payload_format, created_at, updated_at')
    .eq('id', existingId)
    .eq('kind', 'document')
    .single()
  if (error) throw error
  return toItem({ ...(data as PracticeRow), encrypted_payload, payload_format: 'envelope' })
}

export async function renamePracticeItem(id: string, name: string): Promise<PracticeItem> {
  const nextName = cleanName(name)
  if (!isSupabaseConfigured()) {
    const current = localItems.find((item) => item.id === id)
    if (!current) throw new Error('Item not found')
    current.name = nextName
    current.updated_at = new Date().toISOString()
    return { ...current }
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: current, error: readError } = await supabase
    .from('practice_items')
    .select('id, parent_id, kind, name, encrypted_payload, payload_format, created_at, updated_at')
    .eq('id', id)
    .single()
  if (readError) throw readError
  const [opened] = await withOpenedPayloads('practice_items', [current as PracticeRow])
  const body = opened.encrypted_payload && typeof opened.encrypted_payload === 'object' && !Array.isArray(opened.encrypted_payload)
    ? opened.encrypted_payload as { content?: unknown }
    : {}
  const content = opened.payload_format === 'envelope'
    ? String(body.content || '')
    : contentFromPayload(current.encrypted_payload)
  const encrypted_payload = { v: 0, name: nextName, content } as unknown as Json
  await sealClinicalRecord('practice_items', id, encrypted_payload)
  return toItem({ ...(current as PracticeRow), encrypted_payload, payload_format: 'envelope', name: nextName })
}

export async function deletePracticeItem(id: string): Promise<void> {
  if (!id || id === 'new') return
  if (!isSupabaseConfigured()) {
    removeLocalTree(id)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('practice_items').delete().eq('id', id)
  if (error) throw error
}

export async function setPracticeItemArchived(id: string, archived: boolean): Promise<PracticeItem> {
  if (!id || id === 'new') throw new Error('Document not found')
  const archivedAt = archived ? new Date().toISOString() : null
  if (!isSupabaseConfigured()) {
    const idx = localItems.findIndex((item) => item.id === id)
    if (idx === -1) throw new Error('Document not found')
    localItems[idx] = { ...localItems[idx], archived_at: archivedAt }
    return { ...localItems[idx] }
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  await updateArchiveColumn(() => supabase.from('practice_items').update({ archived_at: archivedAt }).eq('id', id))
  const rows = await selectWithOptionalArchive(
    () => supabase.from('practice_items').select(PRACTICE_COLUMNS).eq('id', id),
    () => supabase.from('practice_items').select(PRACTICE_COLUMNS_BASE).eq('id', id),
  )
  if (!rows[0]) throw new Error('Document not found')
  const [opened] = await withOpenedPayloads('practice_items', [{ ...(rows[0] as PracticeRow), archived_at: archivedAt }])
  return toItem(opened)
}
