/** Minimal record shape for in-memory store entities. */
export type StoreRecord = Record<string, unknown> & { id: string }

export interface Db {
  clients: StoreRecord[]
  bodyMaps: Record<string, StoreRecord>
  profiles: StoreRecord[]
  memberships: StoreRecord[]
  workplaces: StoreRecord[]
  auditLogs: StoreRecord[]
  membershipRequests: StoreRecord[]
  timelineEvents: StoreRecord[]
  progressNotes: StoreRecord[]
  workingDocuments: StoreRecord[]
  episodes: StoreRecord[]
  letters: StoreRecord[]
  appointments: StoreRecord[]
  progressNoteTemplates: StoreRecord[]
  letterTemplates: StoreRecord[]
  orgServices: StoreRecord[]
  journalEntries: StoreRecord[]
}

export type ArrayCollectionName = {
  [K in keyof Db]: Db[K] extends StoreRecord[] ? K : never
}[keyof Db]
