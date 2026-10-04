import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import {
  listLocalReports,
  rememberLocalReport,
  saveLocalReport,
  type AppReport,
} from '../store/reports'

const REPORT_COLUMNS = 'id, owner_id, organization_id, client_id, episode_id, author_id, report_date, encrypted_payload, created_at, updated_at'

type ReportRow = {
  id: string
  owner_id: string
  organization_id: string | null
  client_id: string
  episode_id: string | null
  author_id: string
  report_date: string | null
  encrypted_payload: Json
  created_at: string
  updated_at: string
}

function parseReport(raw: Json | null | undefined): { title: string; body: string } {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return {
    title: String(row.title || 'Untitled report'),
    body: String(row.body || ''),
  }
}

function toAppReport(row: ReportRow): AppReport {
  const payload = parseReport(row.encrypted_payload)
  return {
    id: row.id,
    client_id: row.client_id,
    episode_id: row.episode_id,
    author_id: row.author_id,
    owner_id: row.owner_id,
    organization_id: row.organization_id,
    title: payload.title,
    body: payload.body,
    report_date: row.report_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listReportsForEpisode(episodeId: string): Promise<AppReport[]> {
  if (!episodeId) return []
  if (!isSupabaseConfigured()) return listLocalReports(episodeId)
  const supabase = getSupabase()
  if (!supabase) return listLocalReports(episodeId)
  const { data, error } = await supabase
    .from('reports')
    .select(REPORT_COLUMNS)
    .eq('episode_id', episodeId)
    .order('report_date', { ascending: false })
  if (error) throw error
  for (const row of data || []) rememberLocalReport(toAppReport(row as ReportRow))
  return listLocalReports(episodeId)
}

export async function saveReportForUser(input: {
  id?: string | null
  clientId: string
  episodeId: string
  userId: string
  organizationId?: string | null
  title: string
  body: string
  reportDate?: string | null
}): Promise<AppReport> {
  const title = input.title.trim() || 'Untitled report'
  const body = input.body || ''
  const reportDate = input.reportDate || new Date().toISOString().slice(0, 10)
  if (!isSupabaseConfigured()) {
    return saveLocalReport({
      id: input.id,
      clientId: input.clientId,
      episodeId: input.episodeId,
      authorId: input.userId,
      ownerId: input.userId,
      organizationId: input.organizationId,
      title,
      body,
      reportDate,
    })
  }
  const supabase = getSupabase()
  if (!supabase) {
    return saveLocalReport({
      id: input.id,
      clientId: input.clientId,
      episodeId: input.episodeId,
      authorId: input.userId,
      ownerId: input.userId,
      organizationId: input.organizationId,
      title,
      body,
      reportDate,
    })
  }

  const summary = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  const encrypted_payload = { v: 0, title, body, summary } as unknown as Json
  const existingId = input.id && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : null

  if (existingId) {
    const { data, error } = await supabase
      .from('reports')
      .update({
        episode_id: input.episodeId,
        report_date: reportDate,
        encrypted_payload,
      })
      .eq('id', existingId)
      .select(REPORT_COLUMNS)
      .single()
    if (error) throw error
    return rememberLocalReport(toAppReport(data as ReportRow))
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      owner_id: input.userId,
      organization_id: input.organizationId || null,
      client_id: input.clientId,
      episode_id: input.episodeId,
      author_id: input.userId,
      report_date: reportDate,
      encrypted_payload,
    })
    .select(REPORT_COLUMNS)
    .single()
  if (error) throw error
  return rememberLocalReport(toAppReport(data as ReportRow))
}
