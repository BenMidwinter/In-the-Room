import { type PracticeItem, type PracticeKind } from '../practiceItems'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

type PracticeRow = {
  id: string
  parent_id: string | null
  kind: string
  name: string
  encrypted_payload: Json | null
  created_at: string
  updated_at: string
}

const localItems: PracticeItem[] = []

function contentFromPayload(payload: Json | null | undefined): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
  const content = (payload as { content?: unknown }).content
  return typeof content === 'string' ? content : ''
}

function toItem(row: PracticeRow): PracticeItem {
  const kind: PracticeKind = row.kind === 'folder' ? 'folder' : 'document'
  return {
    id: row.id,
    parent_id: row.parent_id,
    kind,
    name: row.name,
    content: kind === 'folder' ? '' : (contentFromPayload(row.encrypted_payload) || '<p></p>'),
    created_at: row.created_at,
    updated_at: row.updated_at,
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
  const { data, error } = await supabase
    .from('practice_items')
    .select('id, parent_id, kind, name, encrypted_payload, created_at, updated_at')
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map((row) => toItem(row as PracticeRow))
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
  const encrypted_payload = input.kind === 'document'
    ? { v: 0, content: input.content || '<p></p>' } as unknown as Json
    : null
  const { data, error } = await supabase
    .from('practice_items')
    .insert({
      owner_id: user.id,
      parent_id: input.parentId,
      kind: input.kind,
      name: input.name,
      encrypted_payload,
    })
    .select('id, parent_id, kind, name, encrypted_payload, created_at, updated_at')
    .single()
  if (error) throw error
  return toItem(data as PracticeRow)
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
  const { data, error } = await supabase
    .from('practice_items')
    .update({
      name,
      encrypted_payload: { v: 0, content } as unknown as Json,
    })
    .eq('id', existingId)
    .eq('kind', 'document')
    .select('id, parent_id, kind, name, encrypted_payload, created_at, updated_at')
    .single()
  if (error) throw error
  return toItem(data as PracticeRow)
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
  const { data, error } = await supabase
    .from('practice_items')
    .update({ name: nextName })
    .eq('id', id)
    .select('id, parent_id, kind, name, encrypted_payload, created_at, updated_at')
    .single()
  if (error) throw error
  return toItem(data as PracticeRow)
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
