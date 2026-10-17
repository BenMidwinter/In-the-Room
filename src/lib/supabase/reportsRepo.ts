import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import {
  deleteLocalReport,
  listLocalReports,
  rememberLocalReport,
  saveLocalReport,
  setLocalReportArchived,
  type AppReport,
} from '../store/reports'
import { selectWithOptionalArchive, updateArchiveColumn } from './optionalArchive'

const REPORT_COLUMNS_BASE = 'id, owner_id, organization_id, client_id, episode_id, author_id, report_date, encrypted_payload, payload_format, created_at, updated_at'
const REPORT_COLUMNS = `${REPORT_COLUMNS_BASE}, archived_at`

type ReportRow = {
  id: string
  owner_id: string
  organization_id: string | null
  client_id: string
  episode_id: string | null
  author_id: string
  report_date: string | null
  encrypted_payload: Json
  payload_format: string
  created_at: string
  updated_at: string
  archived_at?: string | null
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
    archived_at: row.archived_at || null,
  }
}

export async function listReportsForEpisode(episodeId: string): Promise<AppReport[]> {
  if (!episodeId) return []
  if (!isSupabaseConfigured()) return listLocalReports(episodeId)
  const supabase = getSupabase()
  if (!supabase) return listLocalReports(episodeId)
  const data = await selectWithOptionalArchive(
    () => supabase.from('reports').select(REPORT_COLUMNS).eq('episode_id', episodeId).order('report_date', { ascending: false }),
    () => supabase.from('reports').select(REPORT_COLUMNS_BASE).eq('episode_id', episodeId).order('report_date', { ascending: false }),
  )
  const rows = await withOpenedPayloads('reports', data as ReportRow[])
  for (const row of rows) rememberLocalReport(toAppReport(row))
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
  const payload = { v: 0, title, body, summary }
  const existingId = input.id && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : null

  if (existingId) {
    await sealClinicalRecord('reports', existingId, payload)
    const { data, error } = await supabase
      .from('reports')
      .update({
        episode_id: input.episodeId,
        report_date: reportDate,
      })
      .eq('id', existingId)
      .select(REPORT_COLUMNS_BASE)
      .single()
    if (error) throw error
    return rememberLocalReport(toAppReport({
      ...(data as ReportRow),
      encrypted_payload: payload as unknown as Json,
      payload_format: 'envelope',
    }))
  }

  const created = await createClinicalRecord('reports', {
    client_id: input.clientId,
    episode_id: input.episodeId,
    report_date: reportDate,
  }, payload)
  const { data, error } = await supabase
    .from('reports')
    .select(REPORT_COLUMNS_BASE)
    .eq('id', created.id)
    .single()
  if (error) throw error
  return rememberLocalReport(toAppReport({
    ...(data as ReportRow),
    encrypted_payload: payload as unknown as Json,
    payload_format: 'envelope',
  }))
}

export async function setReportArchived(id: string, archived: boolean): Promise<AppReport> {
  if (!id) throw new Error('Report not found')
  const archivedAt = archived ? new Date().toISOString() : null
  if (!isSupabaseConfigured()) return setLocalReportArchived(id, archivedAt)
  const supabase = getSupabase()
  if (!supabase) return setLocalReportArchived(id, archivedAt)
  await updateArchiveColumn(() => supabase.from('reports').update({ archived_at: archivedAt }).eq('id', id))
  const rows = await selectWithOptionalArchive(
    () => supabase.from('reports').select(REPORT_COLUMNS).eq('id', id),
    () => supabase.from('reports').select(REPORT_COLUMNS_BASE).eq('id', id),
  )
  if (!rows[0]) throw new Error('Report not found')
  const [opened] = await withOpenedPayloads('reports', [{ ...(rows[0] as ReportRow), archived_at: archivedAt }])
  return rememberLocalReport(toAppReport(opened))
}

export async function deleteReport(id: string): Promise<void> {
  if (!id) return
  if (!isSupabaseConfigured()) {
    deleteLocalReport(id)
    return
  }
  const supabase = getSupabase()
  if (!supabase) {
    deleteLocalReport(id)
    return
  }
  const { error } = await supabase.from('reports').delete().eq('id', id)
  if (error) throw error
  deleteLocalReport(id)
}
