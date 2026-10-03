/**
 * Derive clinician calendar blocks from a service definition.
 * Client-facing duration stays on the session; optional follow-on support
 * (e.g. report writing) is appended for SaaS/Google occupancy.
 */

export type ServiceLike = {
  id: string
  service_type: string
  default_duration_minutes: number
  follow_on_service_id?: string | null
  follow_on_duration_minutes?: number | null
  buffer_minutes?: number | null
}

export type PlannedBlock = {
  blockRole: 'client_session' | 'support' | 'admin' | 'busy'
  serviceId: string
  startsAt: Date
  endsAt: Date
  parentTempKey?: 'session'
  tempKey: 'session' | 'support'
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

/** Plan session (+ optional follow-on) starting at `startsAt`. */
export function planAppointmentBlocks(
  service: ServiceLike,
  startsAt: Date,
  followOnService?: ServiceLike | null,
): PlannedBlock[] {
  const sessionMinutes = service.default_duration_minutes
  const sessionEnd = addMinutes(startsAt, sessionMinutes)

  if (service.service_type !== 'appointment') {
    return [{
      tempKey: 'session',
      blockRole: service.service_type === 'support'
        ? 'support'
        : service.service_type === 'busy'
          ? 'busy'
          : 'admin',
      serviceId: service.id,
      startsAt,
      endsAt: sessionEnd,
    }]
  }

  const blocks: PlannedBlock[] = [{
    tempKey: 'session',
    blockRole: 'client_session',
    serviceId: service.id,
    startsAt,
    endsAt: sessionEnd,
  }]

  if (service.follow_on_service_id && followOnService) {
    const supportMinutes = service.follow_on_duration_minutes
      ?? followOnService.default_duration_minutes
    blocks.push({
      tempKey: 'support',
      parentTempKey: 'session',
      blockRole: 'support',
      serviceId: followOnService.id,
      startsAt: sessionEnd,
      endsAt: addMinutes(sessionEnd, supportMinutes),
    })
  }

  return blocks
}

/** Total clinician-occupied minutes including follow-on (excludes buffer). */
export function clinicianOccupiedMinutes(
  service: ServiceLike,
  followOnService?: ServiceLike | null,
): number {
  const blocks = planAppointmentBlocks(service, new Date(), followOnService)
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  return Math.round((last.endsAt.getTime() - first.startsAt.getTime()) / 60_000)
}
