import type { Json } from './database.types'
import { invokeFunction } from './invokeFunction'

export const CLINICAL_TABLES = [
  'progress_notes',
  'letters',
  'reports',
  'form_submissions',
  'outcome_entries',
  'clients',
  'client_identities',
  'client_clinical_profiles',
  'contacts',
  'episodes',
  'appointments',
  'timeline_events',
  'templates',
  'working_documents',
  'journal_entries',
  'practice_items',
  'cpd_entries',
  'supervision_entries',
  'waitlist_placements',
  'tags',
  'invoices',
  'invoice_lines',
  'invoice_payments',
  'form_definitions',
  'outcome_measure_defs',
  'profiles',
] as const

export type ClinicalTable = (typeof CLINICAL_TABLES)[number]

const OPEN_LIMIT = 80

export function isEnvelopeFormat(format: string | null | undefined): boolean {
  return format === 'envelope'
}

export async function withOpenedPayloads<T extends { id: string }>(
  table: ClinicalTable,
  rows: T[],
  options?: { payloadKey?: string; formatKey?: string },
): Promise<T[]> {
  const payloadKey = options?.payloadKey ?? 'encrypted_payload'
  const formatKey = options?.formatKey ?? 'payload_format'
  const ids = rows
    .filter((row) => isEnvelopeFormat((row as Record<string, unknown>)[formatKey] as string | null | undefined))
    .map((row) => row.id)
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
    if (payload === undefined) return row
    return { ...row, [payloadKey]: payload } as T
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
