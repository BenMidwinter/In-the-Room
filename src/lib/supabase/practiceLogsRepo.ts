import {
  logContentFromPayload,
  logPayload,
  normalizePracticeLogInput,
  type LogKind,
  type PracticeLog,
  type PracticeLogInput,
  type SupervisionDirection,
} from '../practiceLogs'
import { createClinicalRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import { isTrashExpired, statusTimestamps } from '../recordStatus'
import { selectWithOptionalStatus, updateStatusColumns } from './optionalRecordStatus'

type StoredLog = PracticeLog & { owner_id: string }

type LogRow = {
  id: string
  occurred_on: string
  minutes: number
  label: string
  direction?: string | null
  encrypted_payload: Json | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  trashed_at?: string | null
}

type LogStatus = 'active' | 'archive' | 'trash'

const localLogs: StoredLog[] = []

const CPD_COLUMNS_BASE = 'id, occurred_on, minutes, label, encrypted_payload, payload_format, created_at, updated_at'
const CPD_COLUMNS_ARCHIVE = `${CPD_COLUMNS_BASE}, archived_at`
const CPD_COLUMNS = `${CPD_COLUMNS_ARCHIVE}, trashed_at`
const SUPERVISION_COLUMNS_BASE = 'id, occurred_on, minutes, label, direction, encrypted_payload, payload_format, created_at, updated_at'
const SUPERVISION_COLUMNS_ARCHIVE = `${SUPERVISION_COLUMNS_BASE}, archived_at`
const SUPERVISION_COLUMNS = `${SUPERVISION_COLUMNS_ARCHIVE}, trashed_at`

function toLog(kind: LogKind, row: LogRow): PracticeLog {
  const direction = row.direction === 'delivered' || row.direction === 'received'
    ? row.direction
    : null
  return {
    id: row.id,
    kind,
    occurred_on: String(row.occurred_on).slice(0, 10),
    minutes: Number(row.minutes) || 0,
    label: row.label,
    direction: kind === 'supervision' ? direction : null,
    content: logContentFromPayload(row.encrypted_payload),
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
    trashed_at: row.trashed_at || null,
  }
}

function sortLogs(items: PracticeLog[]): PracticeLog[] {
  return [...items].sort((a, b) => {
    const byDate = b.occurred_on.localeCompare(a.occurred_on)
    if (byDate !== 0) return byDate
    return b.created_at.localeCompare(a.created_at)
  })
}

function listLocal(kind: LogKind, userId: string): PracticeLog[] {
  return sortLogs(
    localLogs
      .filter((entry) => entry.kind === kind && entry.owner_id === userId && !isTrashExpired(entry.trashed_at))
      .map(({ owner_id: _owner, ...entry }) => entry),
  )
}

async function purgeExpired(kind: LogKind, rows: LogRow[]) {
  const supabase = getSupabase()
  if (!supabase) return rows
  const table = kind === 'cpd' ? 'cpd_entries' : 'supervision_entries'
  const keep: LogRow[] = []
  for (const row of rows) {
    if (!isTrashExpired(row.trashed_at)) {
      keep.push(row)
      continue
    }
    await supabase.from(table).delete().eq('id', row.id)
    const index = localLogs.findIndex((entry) => entry.id === row.id)
    if (index >= 0) localLogs.splice(index, 1)
  }
  return keep
}

export async function listPracticeLogs(kind: LogKind, userId: string): Promise<PracticeLog[]> {
  if (!userId) return []
  if (!isSupabaseConfigured()) return listLocal(kind, userId)
  const supabase = getSupabase()
  if (!supabase) return listLocal(kind, userId)

  if (kind === 'cpd') {
    const data = await selectWithOptionalStatus(
      () => supabase.from('cpd_entries').select(CPD_COLUMNS).order('occurred_on', { ascending: false }),
      () => supabase.from('cpd_entries').select(CPD_COLUMNS_ARCHIVE).order('occurred_on', { ascending: false }),
      () => supabase.from('cpd_entries').select(CPD_COLUMNS_BASE).order('occurred_on', { ascending: false }),
    )
    const surviving = await purgeExpired(kind, data as LogRow[])
    const rows = await withOpenedPayloads('cpd_entries', surviving)
    return sortLogs(rows.map((row) => toLog(kind, row)))
  }

  const data = await selectWithOptionalStatus(
    () => supabase.from('supervision_entries').select(SUPERVISION_COLUMNS).order('occurred_on', { ascending: false }),
    () => supabase.from('supervision_entries').select(SUPERVISION_COLUMNS_ARCHIVE).order('occurred_on', { ascending: false }),
    () => supabase.from('supervision_entries').select(SUPERVISION_COLUMNS_BASE).order('occurred_on', { ascending: false }),
  )
  const surviving = await purgeExpired(kind, data as LogRow[])
  const rows = await withOpenedPayloads('supervision_entries', surviving)
  return sortLogs(rows.map((row) => toLog(kind, row)))
}

export async function savePracticeLog(kind: LogKind, userId: string, input: PracticeLogInput): Promise<PracticeLog> {
  if (!userId) throw new Error('Sign in required')
  const parsed = normalizePracticeLogInput(kind, input)
  const now = new Date().toISOString()

  if (!isSupabaseConfigured()) {
    return saveLocal(kind, userId, parsed, now)
  }
  const supabase = getSupabase()
  if (!supabase) return saveLocal(kind, userId, parsed, now)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const encrypted_payload = logPayload(parsed.content) as unknown as Json
  const shared = { occurred_on: parsed.occurred_on, minutes: parsed.minutes, label: parsed.label }

  if (kind === 'cpd') {
    if (parsed.id) {
      await sealClinicalRecord('cpd_entries', parsed.id, encrypted_payload)
      const { error } = await supabase.from('cpd_entries').update(shared).eq('id', parsed.id)
      if (error) throw error
      const { data, error: readError } = await supabase.from('cpd_entries').select(CPD_COLUMNS_BASE).eq('id', parsed.id).single()
      if (readError) throw readError
      return toLog(kind, { ...(data as LogRow), encrypted_payload })
    }
    const created = await createClinicalRecord('cpd_entries', shared, encrypted_payload)
    const { data, error } = await supabase.from('cpd_entries').select(CPD_COLUMNS_BASE).eq('id', created.id).single()
    if (error) throw error
    return toLog(kind, { ...(data as LogRow), encrypted_payload })
  }

  const direction: SupervisionDirection = parsed.direction || 'received'
  const fields = { ...shared, direction }
  if (parsed.id) {
    await sealClinicalRecord('supervision_entries', parsed.id, encrypted_payload)
    const { error } = await supabase.from('supervision_entries').update(fields).eq('id', parsed.id)
    if (error) throw error
    const { data, error: readError } = await supabase.from('supervision_entries').select(SUPERVISION_COLUMNS_BASE).eq('id', parsed.id).single()
    if (readError) throw readError
    return toLog(kind, { ...(data as LogRow), encrypted_payload })
  }
  const created = await createClinicalRecord('supervision_entries', fields, encrypted_payload)
  const { data, error } = await supabase.from('supervision_entries').select(SUPERVISION_COLUMNS_BASE).eq('id', created.id).single()
  if (error) throw error
  return toLog(kind, { ...(data as LogRow), encrypted_payload })
}

export async function setPracticeLogStatus(kind: LogKind, userId: string, id: string, nextStatus: LogStatus): Promise<PracticeLog> {
  if (!userId || !id || id === 'new') throw new Error('Entry not found')
  if (!isSupabaseConfigured() || !getSupabase()) {
    const existing = localLogs.find((entry) => entry.id === id && entry.owner_id === userId && entry.kind === kind)
    if (!existing) throw new Error('Entry not found')
    const patch = statusTimestamps(nextStatus, existing)
    Object.assign(existing, patch)
    const { owner_id: _owner, ...entry } = existing
    return { ...entry }
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  if (kind === 'cpd') {
    const currentRows = await selectWithOptionalStatus(
      () => supabase.from('cpd_entries').select(CPD_COLUMNS).eq('id', id),
      () => supabase.from('cpd_entries').select(CPD_COLUMNS_ARCHIVE).eq('id', id),
      () => supabase.from('cpd_entries').select(CPD_COLUMNS_BASE).eq('id', id),
    )
    if (!currentRows[0]) throw new Error('Entry not found')
    const current = currentRows[0] as unknown as LogRow
    const patch = statusTimestamps(nextStatus, current)
    await updateStatusColumns(() => supabase.from('cpd_entries').update(patch).eq('id', id))
    const [opened] = await withOpenedPayloads('cpd_entries', [{ ...current, ...patch }])
    return toLog(kind, opened)
  }
  const currentRows = await selectWithOptionalStatus(
    () => supabase.from('supervision_entries').select(SUPERVISION_COLUMNS).eq('id', id),
    () => supabase.from('supervision_entries').select(SUPERVISION_COLUMNS_ARCHIVE).eq('id', id),
    () => supabase.from('supervision_entries').select(SUPERVISION_COLUMNS_BASE).eq('id', id),
  )
  if (!currentRows[0]) throw new Error('Entry not found')
  const current = currentRows[0] as unknown as LogRow
  const patch = statusTimestamps(nextStatus, current)
  await updateStatusColumns(() => supabase.from('supervision_entries').update(patch).eq('id', id))
  const [opened] = await withOpenedPayloads('supervision_entries', [{ ...current, ...patch }])
  return toLog(kind, opened)
}

/** @deprecated Prefer setPracticeLogStatus */
export async function setPracticeLogArchived(kind: LogKind, userId: string, id: string, archived: boolean): Promise<PracticeLog> {
  return setPracticeLogStatus(kind, userId, id, archived ? 'archive' : 'active')
}

function saveLocal(
  kind: LogKind,
  userId: string,
  parsed: ReturnType<typeof normalizePracticeLogInput>,
  now: string,
): PracticeLog {
  if (parsed.id) {
    const existing = localLogs.find((entry) => entry.id === parsed.id && entry.owner_id === userId && entry.kind === kind)
    if (!existing) throw new Error('Entry not found')
    existing.occurred_on = parsed.occurred_on
    existing.minutes = parsed.minutes
    existing.label = parsed.label
    existing.direction = parsed.direction
    existing.content = parsed.content
    existing.updated_at = now
    return { ...existing }
  }
  const created: StoredLog = {
    id: crypto.randomUUID(),
    owner_id: userId,
    kind,
    occurred_on: parsed.occurred_on,
    minutes: parsed.minutes,
    label: parsed.label,
    direction: parsed.direction,
    content: parsed.content,
    created_at: now,
    updated_at: now,
  }
  localLogs.push(created)
  const { owner_id: _owner, ...entry } = created
  return entry
}

export async function deletePracticeLog(kind: LogKind, userId: string, id: string): Promise<void> {
  if (!userId || !id || id === 'new') return
  if (!isSupabaseConfigured()) {
    const index = localLogs.findIndex((entry) => entry.id === id && entry.owner_id === userId && entry.kind === kind)
    if (index >= 0) localLogs.splice(index, 1)
    return
  }
  const supabase = getSupabase()
  if (!supabase) {
    const index = localLogs.findIndex((entry) => entry.id === id && entry.owner_id === userId && entry.kind === kind)
    if (index >= 0) localLogs.splice(index, 1)
    return
  }
  const query = kind === 'cpd'
    ? supabase.from('cpd_entries').delete().eq('id', id)
    : supabase.from('supervision_entries').delete().eq('id', id)
  const { error } = await query
  if (error) throw error
}
