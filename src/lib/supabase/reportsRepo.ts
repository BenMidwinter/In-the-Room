import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { isTrashExpired, statusTimestamps } from '../recordStatus'
import { db } from '../data/collections'
import {
  deleteLocalReport,
  listLocalReports,
  rememberLocalReport,
  saveLocalReport,
  type AppReport,
} from '../store/reports'
import { selectWithOptionalStatus, updateStatusColumns } from './optionalRecordStatus'

const REPORT_COLUMNS_BASE = 'id, owner_id, organization_id, client_id, episode_id, author_id, report_date, encrypted_payload, payload_format, created_at, updated_at'
const REPORT_COLUMNS_ARCHIVE = `${REPORT_COLUMNS_BASE}, archived_at`
const REPORT_COLUMNS = `${REPORT_COLUMNS_ARCHIVE}, trashed_at`

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
  trashed_at?: string | null
}

type ReportStatus = 'active' | 'archive' | 'trash'

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
    trashed_at: row.trashed_at || null,
  }
}

function filterLocalReports(episodeId: string): AppReport[] {
  return listLocalReports(episodeId).filter((row) => !isTrashExpired(row.trashed_at))
}

async function purgeExpired(episodeId: string, rows: ReportRow[]) {
  const supabase = getSupabase()
  if (!supabase) return rows
  const keep: ReportRow[] = []
  for (const row of rows) {
    if (!isTrashExpired(row.trashed_at)) {
      keep.push(row)
      continue
    }
    await supabase.from('reports').delete().eq('id', row.id).eq('episode_id', episodeId)
    deleteLocalReport(row.id)
  }
  return keep
}

export async function listReportsForEpisode(episodeId: string): Promise<AppReport[]> {
  if (!episodeId) return []
  if (!isSupabaseConfigured()) return filterLocalReports(episodeId)
  const supabase = getSupabase()
  if (!supabase) return filterLocalReports(episodeId)
  const data = await selectWithOptionalStatus(
    () => supabase.from('reports').select(REPORT_COLUMNS).eq('episode_id', episodeId).order('report_date', { ascending: false }),
    () => supabase.from('reports').select(REPORT_COLUMNS_ARCHIVE).eq('episode_id', episodeId).order('report_date', { ascending: false }),
    () => supabase.from('reports').select(REPORT_COLUMNS_BASE).eq('episode_id', episodeId).order('report_date', { ascending: false }),
  )
  const surviving = await purgeExpired(episodeId, data as ReportRow[])
  const rows = await withOpenedPayloads('reports', surviving)
  for (const row of rows) rememberLocalReport(toAppReport(row))
  return filterLocalReports(episodeId)
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

function findLocalReport(id: string): AppReport | undefined {
  const row = db.reports.find((item) => item.id === id)
  return row ? (row as unknown as AppReport) : undefined
}

export async function setReportStatus(id: string, nextStatus: ReportStatus): Promise<AppReport> {
  if (!id) throw new Error('Report not found')
  if (!isSupabaseConfigured() || !getSupabase()) {
    const report = findLocalReport(id)
    if (!report) throw new Error('Report not found')
    const patch = statusTimestamps(nextStatus, report)
    return rememberLocalReport({ ...report, ...patch })
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const currentRows = await selectWithOptionalStatus(
    () => supabase.from('reports').select(REPORT_COLUMNS).eq('id', id),
    () => supabase.from('reports').select(REPORT_COLUMNS_ARCHIVE).eq('id', id),
    () => supabase.from('reports').select(REPORT_COLUMNS_BASE).eq('id', id),
  )
  if (!currentRows[0]) throw new Error('Report not found')
  const current = currentRows[0] as ReportRow
  const patch = statusTimestamps(nextStatus, current)
  await updateStatusColumns(() => supabase.from('reports').update(patch).eq('id', id))
  const [opened] = await withOpenedPayloads('reports', [{ ...current, ...patch }])
  return rememberLocalReport(toAppReport(opened))
}

/** @deprecated Prefer setReportStatus */
export async function setReportArchived(id: string, archived: boolean): Promise<AppReport> {
  return setReportStatus(id, archived ? 'archive' : 'active')
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
