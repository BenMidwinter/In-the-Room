/** Hours after sign-off before a Process Note becomes permanently locked. */
export const PROGRESS_NOTE_LOCK_HOURS = 48

export type ProgressNoteStatus = 'draft' | 'signed_off'

export interface ProgressNoteLockFields {
  status?: ProgressNoteStatus
  signed_off_at?: string | null
  lock_until?: string | null
  is_locked?: boolean
}

export function lockUntilFromSignOff(signedOffAt: Date = new Date()): string {
  return new Date(signedOffAt.getTime() + PROGRESS_NOTE_LOCK_HOURS * 60 * 60 * 1000).toISOString()
}

/** Attach computed `is_locked` for consumers (calendar drawer, editor chrome, etc.). */
export function enrichProgressNoteLock<T extends Record<string, unknown>>(note: T): T & ProgressNoteLockFields {
  const status = (note.status as ProgressNoteStatus | undefined) || 'draft'
  const lockUntil = note.lock_until as string | null | undefined
  const isLocked = status === 'signed_off'
    && Boolean(lockUntil)
    && Date.now() >= new Date(lockUntil as string).getTime()

  return {
    ...note,
    status,
    is_locked: isLocked,
  }
}

/** Draft and signed-off notes remain editable until the 48h lock elapses. */
export function isProgressNoteEditable(note: ProgressNoteLockFields | null | undefined): boolean {
  if (!note) return true
  return !enrichProgressNoteLock(note as Record<string, unknown>).is_locked
}

export function isProgressNoteSignedOff(note: ProgressNoteLockFields | null | undefined): boolean {
  return (note?.status || 'draft') === 'signed_off'
}

/** Notes history / list display label for draft vs signed-off notes. */
export function progressNoteHistoryStatusLabel(
  note: ProgressNoteLockFields | null | undefined,
): 'DRAFT' | 'COMPLETE' {
  return isProgressNoteSignedOff(note) ? 'COMPLETE' : 'DRAFT'
}

/** Remaining time until a signed-off note locks, for example "47h 12m". */
export function formatLockCountdown(lockUntil: string | null | undefined, now: number = Date.now()): string | null {
  if (!lockUntil) return null
  const remaining = new Date(lockUntil).getTime() - now
  if (!Number.isFinite(remaining) || remaining <= 0) return null
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return 'under a minute'
}

export function formatLockDeadline(lockUntil: string | null | undefined): string | null {
  if (!lockUntil) return null
  try {
    return new Date(lockUntil).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return lockUntil
  }
}
