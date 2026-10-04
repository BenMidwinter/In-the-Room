import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'

export const TEMPLATE_KINDS = ['progress_note', 'letter', 'report', 'working_document'] as const

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

export type AppTemplate = {
  id: string
  kind: TemplateKind
  name: string
  content: string
  is_active: boolean
  updated_at: string
}

type TemplateRow = {
  id: string
  kind: string
  name: string
  is_active: boolean
  encrypted_payload: Json | null
  updated_at: string
}

const localTemplates: AppTemplate[] = []

function contentFromPayload(payload: Json | null | undefined): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '<p></p>'
  const content = (payload as { content?: unknown }).content
  return typeof content === 'string' && content.trim() ? content : '<p></p>'
}

function toTemplate(row: TemplateRow): AppTemplate {
  return {
    id: row.id,
    kind: row.kind as TemplateKind,
    name: row.name,
    content: contentFromPayload(row.encrypted_payload),
    is_active: row.is_active !== false,
    updated_at: row.updated_at,
  }
}

function listLocal(kind: TemplateKind): AppTemplate[] {
  return localTemplates
    .filter((template) => template.kind === kind && template.is_active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listTemplates(kind: TemplateKind): Promise<AppTemplate[]> {
  if (!isSupabaseConfigured()) return listLocal(kind)
  const supabase = getSupabase()
  if (!supabase) return listLocal(kind)
  const { data, error } = await supabase
    .from('templates')
    .select('id, kind, name, is_active, encrypted_payload, updated_at')
    .eq('kind', kind)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map((row) => toTemplate(row as TemplateRow))
}

export async function saveTemplate(input: {
  id?: string | null
  kind: TemplateKind
  name: string
  content: string
}): Promise<AppTemplate> {
  const name = input.name.trim()
  if (!name) throw new Error('Add a template name.')
  const content = input.content || '<p></p>'
  const existingId = input.id && input.id !== 'new' ? input.id : null

  if (!isSupabaseConfigured()) {
    const now = new Date().toISOString()
    if (existingId) {
      const idx = localTemplates.findIndex((template) => template.id === existingId)
      if (idx === -1) throw new Error('Template not found')
      localTemplates[idx] = { ...localTemplates[idx], name, content, updated_at: now }
      return localTemplates[idx]
    }
    const created: AppTemplate = {
      id: `local-${crypto.randomUUID()}`,
      kind: input.kind,
      name,
      content,
      is_active: true,
      updated_at: now,
    }
    localTemplates.push(created)
    return created
  }

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const encrypted_payload = { v: 0, content } as unknown as Json
  if (existingId) {
    const { data, error } = await supabase
      .from('templates')
      .update({ name, encrypted_payload, is_active: true })
      .eq('id', existingId)
      .select('id, kind, name, is_active, encrypted_payload, updated_at')
      .single()
    if (error) throw error
    return toTemplate(data as TemplateRow)
  }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      owner_id: user.id,
      kind: input.kind,
      name,
      is_active: true,
      encrypted_payload,
    })
    .select('id, kind, name, is_active, encrypted_payload, updated_at')
    .single()
  if (error) throw error
  return toTemplate(data as TemplateRow)
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!id || id === 'new') return
  if (!isSupabaseConfigured()) {
    const idx = localTemplates.findIndex((template) => template.id === id)
    if (idx !== -1) localTemplates.splice(idx, 1)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw error
}
