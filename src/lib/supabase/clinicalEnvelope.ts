import type { Json } from './database.types'
import { invokeFunction } from './invokeFunction'

export const CLINICAL_TABLES = [
  'progress_notes',
  'letters',
  'reports',
  'form_submissions',
  'outcome_entries',
] as const

export type ClinicalTable = (typeof CLINICAL_TABLES)[number]

type ClinicalRow = {
  id: string
  payload_format?: string | null
  encrypted_payload: Json
}

const OPEN_LIMIT = 80

export function isEnvelopeFormat(format: string | null | undefined): boolean {
  return format === 'envelope'
}

export async function withOpenedPayloads<T extends ClinicalRow>(table: ClinicalTable, rows: T[]): Promise<T[]> {
  const ids = rows.filter((row) => isEnvelopeFormat(row.payload_format)).map((row) => row.id)
  if (!ids.length) return rows
  const opened = new Map<string, Json>()
  for (let index = 0; index < ids.length; index += OPEN_LIMIT) {
    const chunk = ids.slice(index, index + OPEN_LIMIT)
    const data = await invokeFunction<{ records?: { id: string; payload: Json }[] }>('clinical-record', {
      body: { action: 'open', table, ids: chunk },
    })
    for (const record of data.records || []) opened.set(record.id, record.payload)
  }
  return rows.map((row) => {
    const payload = opened.get(row.id)
    return payload === undefined ? row : { ...row, encrypted_payload: payload }
  })
}

export async function createClinicalRecord(
  table: ClinicalTable,
  row: Record<string, unknown>,
  payload: unknown,
): Promise<{ id: string }> {
  return invokeFunction('clinical-record', {
    body: { action: 'create', table, row, payload },
  })
}

export async function sealClinicalRecord(
  table: ClinicalTable,
  id: string,
  payload: unknown,
): Promise<void> {
  await invokeFunction('clinical-record', {
    body: { action: 'seal', table, id, payload },
  })
}

export async function invokeFormRecord<T>(action: 'form-start' | 'form-open' | 'form-save' | 'form-submit', body: Record<string, unknown>): Promise<T> {
  return invokeFunction<T>('clinical-record', { body: { action, ...body } })
}
