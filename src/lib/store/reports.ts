import { db } from '../data/collections'
import type { StoreRecord } from '../types/collections'

export type AppReport = {
  id: string
  client_id: string
  episode_id: string | null
  author_id: string
  owner_id: string
  organization_id: string | null
  title: string
  body: string
  report_date: string | null
  created_at: string
  updated_at: string
}

function asReport(row: StoreRecord): AppReport {
  return row as unknown as AppReport
}

export function listLocalReports(episodeId: string): AppReport[] {
  return db.reports
    .filter((row) => row.episode_id === episodeId)
    .map(asReport)
    .sort((a, b) => String(b.report_date || b.updated_at).localeCompare(String(a.report_date || a.updated_at)))
}

export function rememberLocalReport(report: AppReport): AppReport {
  const idx = db.reports.findIndex((row) => row.id === report.id)
  if (idx === -1) db.reports.push(report as unknown as StoreRecord)
  else db.reports[idx] = { ...db.reports[idx], ...report } as StoreRecord
  return report
}

export function saveLocalReport(input: {
  id?: string | null
  clientId: string
  episodeId: string
  authorId: string
  ownerId: string
  organizationId?: string | null
  title: string
  body: string
  reportDate?: string | null
}): AppReport {
  const now = new Date().toISOString()
  if (input.id) {
    const idx = db.reports.findIndex((row) => row.id === input.id)
    if (idx === -1) throw new Error('Report not found')
    const prev = asReport(db.reports[idx])
    const next: AppReport = {
      ...prev,
      title: input.title,
      body: input.body,
      report_date: input.reportDate ?? prev.report_date,
      episode_id: input.episodeId,
      updated_at: now,
    }
    db.reports[idx] = next as unknown as StoreRecord
    return next
  }

  const created: AppReport = {
    id: crypto.randomUUID(),
    client_id: input.clientId,
    episode_id: input.episodeId,
    author_id: input.authorId,
    owner_id: input.ownerId,
    organization_id: input.organizationId || null,
    title: input.title || 'Untitled report',
    body: input.body || '',
    report_date: input.reportDate || now.slice(0, 10),
    created_at: now,
    updated_at: now,
  }
  rememberLocalReport(created)
  return created
}
