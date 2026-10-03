import {
  CLIENTS as SEED_CLIENTS,
  BODY_MAPS as SEED_BODY_MAPS,
  CLINICIAN_PROFILES as SEED_PROFILES,
  CLINICIAN_WORKPLACES as SEED_MEMBERSHIPS,
  WORKPLACES as SEED_WORKPLACES,
  WORKPLACE_AUDIT_LOGS as SEED_LOGS,
  MEMBERSHIP_REQUESTS as SEED_MEMBERSHIP_REQUESTS,
  TIMELINE_EVENTS as SEED_TIMELINE,
  PROGRESS_NOTES as SEED_NOTES,
  WORKING_DOCUMENTS as SEED_DOCS,
  EPISODES as SEED_EPISODES,
  LETTERS as SEED_LETTERS,
  APPOINTMENTS as SEED_APPOINTMENTS,
  PROGRESS_NOTE_TEMPLATES as SEED_NOTE_TEMPLATES,
  LETTER_TEMPLATES as SEED_LETTER_TEMPLATES,
  ORG_SERVICES as SEED_ORG_SERVICES,
  CLINICIAN_JOURNAL_ENTRIES as SEED_JOURNAL,
} from '../mockData'
import type { ArrayCollectionName, Db, StoreRecord } from '../types/collections'

/**
 * Thin data-access layer. This module owns *persistence* only — the mutable
 * collections plus generic CRUD primitives. It knows nothing about business
 * rules, permissions, or validation; domain modules in `../store/` layer those
 * on top. Today the backing store is an in-memory clone of the mock seed data;
 * swapping to a real API/database means changing only this file.
 */

function seed(): Db {
  return {
    clients: structuredClone(SEED_CLIENTS) as StoreRecord[],
    bodyMaps: structuredClone(SEED_BODY_MAPS) as unknown as Record<string, StoreRecord>,
    profiles: structuredClone(SEED_PROFILES) as StoreRecord[],
    memberships: structuredClone(SEED_MEMBERSHIPS) as unknown as StoreRecord[],
    workplaces: structuredClone(SEED_WORKPLACES) as StoreRecord[],
    auditLogs: structuredClone(SEED_LOGS) as StoreRecord[],
    membershipRequests: structuredClone(SEED_MEMBERSHIP_REQUESTS) as StoreRecord[],
    timelineEvents: structuredClone(SEED_TIMELINE) as StoreRecord[],
    progressNotes: structuredClone(SEED_NOTES) as StoreRecord[],
    workingDocuments: structuredClone(SEED_DOCS) as StoreRecord[],
    episodes: structuredClone(SEED_EPISODES) as StoreRecord[],
    letters: structuredClone(SEED_LETTERS) as StoreRecord[],
    appointments: structuredClone(SEED_APPOINTMENTS) as StoreRecord[],
    progressNoteTemplates: structuredClone(SEED_NOTE_TEMPLATES) as StoreRecord[],
    letterTemplates: structuredClone(SEED_LETTER_TEMPLATES) as StoreRecord[],
    orgServices: structuredClone(SEED_ORG_SERVICES) as StoreRecord[],
    journalEntries: structuredClone(SEED_JOURNAL) as StoreRecord[],
  }
}

/** Live, mutable collections. Domain modules read/write via `db.<collection>`. */
export const db: Db = seed()

/** Restore every collection to a fresh clone of the seed data. */
export function resetDb() {
  Object.assign(db, seed())
}

export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`
}

/* ── Generic array primitives ─────────────────────────────────────────────
   Small, intention-revealing accessors so domain modules don't hand-roll the
   same find/index/splice dance. Object-keyed collections (e.g. bodyMaps) are
   accessed directly via `db`. */

export function list(name: ArrayCollectionName): StoreRecord[] {
  return [...db[name]]
}

export function findById(name: ArrayCollectionName, id: string): StoreRecord | null {
  return db[name].find(record => record.id === id) || null
}

export function insert(name: ArrayCollectionName, record: StoreRecord): StoreRecord {
  db[name].push(record)
  return record
}

export function replaceById(name: ArrayCollectionName, id: string, next: StoreRecord): StoreRecord | null {
  const idx = db[name].findIndex(record => record.id === id)
  if (idx === -1) return null
  db[name][idx] = next
  return db[name][idx]
}

export function indexOfId(name: ArrayCollectionName, id: string): number {
  return db[name].findIndex(record => record.id === id)
}
