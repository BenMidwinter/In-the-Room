/**
 * Episode attachment rules.
 *
 * An episode is one course of treatment. A client may have none, and at most
 * one active course. Discharge closes the course and leaves its notes and
 * reports editable. The next client session opens a new episode.
 */

export type EpisodeAttachmentInput = {
  blockRole?: string | null
  clientId?: string | null
  isCreate: boolean
  requestedEpisodeId?: string | null
  existingEpisodeId?: string | null
  activeEpisodeId?: string | null
}

export type EpisodeAttachment = {
  episodeId: string | null
  /** True when a client session is being created and no course is open. */
  open: boolean
}

function cleanId(value: string | null | undefined): string | null {
  const id = String(value || '').trim()
  return id || null
}

/** Decide which episode a booking should carry. Never opens a course on update. */
export function resolveEpisodeAttachment(input: EpisodeAttachmentInput): EpisodeAttachment {
  const requested = cleanId(input.requestedEpisodeId)
  const existing = cleanId(input.existingEpisodeId)
  const active = cleanId(input.activeEpisodeId)
  const isClientSession = (input.blockRole || 'client_session') === 'client_session'
  const hasClient = Boolean(cleanId(input.clientId))

  if (!input.isCreate) {
    return { episodeId: requested ?? existing, open: false }
  }

  if (!isClientSession || !hasClient) {
    return { episodeId: requested, open: false }
  }

  if (requested) return { episodeId: requested, open: false }
  if (active) return { episodeId: active, open: false }
  return { episodeId: null, open: true }
}

/** A Process Note takes its episode from the appointment it is attached to. */
export function episodeIdForAppointment(appointmentEpisodeId?: string | null): string | null {
  return cleanId(appointmentEpisodeId)
}

export function nextEpisodeNumber(existingNumbers: Array<number | null | undefined>): number {
  const max = existingNumbers.reduce<number>((highest, value) => Math.max(highest, Number(value) || 0), 0)
  return max + 1
}
