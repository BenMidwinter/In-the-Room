/**
 * Episode attachment rules.
 *
 * An episode is one course of treatment. A client may have none, and at most
 * one active course. Discharge closes the course. Reopening it makes that
 * course the open one again. A new client session joins the open course, or
 * opens the first one. Support and admin bookings join the open course too.
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

  if (!hasClient) {
    return { episodeId: requested, open: false }
  }

  const joinsOpenCourse = isClientSession
    || input.blockRole === 'support'
    || input.blockRole === 'admin'
  if (!joinsOpenCourse) {
    return { episodeId: requested, open: false }
  }

  if (requested) return { episodeId: requested, open: false }
  if (active) return { episodeId: active, open: false }
  if (isClientSession) return { episodeId: null, open: true }
  return { episodeId: null, open: false }
}

/** A Process Note takes its episode from the appointment it is attached to. */
export function episodeIdForAppointment(appointmentEpisodeId?: string | null): string | null {
  return cleanId(appointmentEpisodeId)
}

export function nextEpisodeNumber(existingNumbers: Array<number | null | undefined>): number {
  const max = existingNumbers.reduce<number>((highest, value) => Math.max(highest, Number(value) || 0), 0)
  return max + 1
}
