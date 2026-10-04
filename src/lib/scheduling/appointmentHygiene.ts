/**
 * Appointment write rules shared by the local store and Supabase.
 * Google busy blocks stay a read model. Follow-on blocks are derived
 * from the service, and series membership is an explicit series_id.
 */

export const SERVICE_TYPES = ['appointment', 'support', 'admin', 'busy'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const BLOCK_ROLES = ['client_session', 'support', 'admin', 'busy'] as const
export type BlockRole = (typeof BLOCK_ROLES)[number]

const BUSY_WRITE_MESSAGE = 'Google busy time is read-only and is not stored as an appointment.'

export function blockRoleForServiceType(serviceType: string | null | undefined): BlockRole {
  if (serviceType === 'admin') return 'admin'
  if (serviceType === 'busy') return 'busy'
  if (serviceType === 'support') return 'support'
  return 'client_session'
}

/** Follow-on rows are never client sessions, even if the linked service is. */
export function followOnBlockRole(serviceType: string | null | undefined): 'support' | 'admin' | 'busy' {
  if (serviceType === 'admin') return 'admin'
  if (serviceType === 'busy') return 'busy'
  return 'support'
}

export function isSyntheticBusyId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('ext-')
}

export function assertWritableAppointment(payload: {
  id?: unknown
  is_external_busy?: unknown
} | null | undefined): void {
  if (!payload) return
  if (payload.is_external_busy || isSyntheticBusyId(payload.id)) {
    throw new Error(BUSY_WRITE_MESSAGE)
  }
}

export type ServiceFollowOnSource = {
  id: string
  service_type?: string | null
  name?: string | null
  slug?: string | null
  default_duration_minutes?: number | null
  follow_on_service_id?: string | null
  follow_on_duration_minutes?: number | null
  is_active?: boolean | null
}

export type FollowOnPlan = {
  serviceId: string
  serviceName: string
  therapyModality: string
  blockRole: 'support' | 'admin' | 'busy'
  durationMinutes: number
}

export function planFollowOnBlock(
  primary: ServiceFollowOnSource | null | undefined,
  followOn: ServiceFollowOnSource | null | undefined,
): FollowOnPlan | null {
  if (!primary?.follow_on_service_id || !followOn) return null
  if (followOn.id !== primary.follow_on_service_id) return null
  if (followOn.is_active === false) return null
  if (primary.service_type && primary.service_type !== 'appointment') return null
  const duration = Number(
    primary.follow_on_duration_minutes
    ?? followOn.default_duration_minutes
    ?? 0,
  )
  if (!Number.isFinite(duration) || duration <= 0) return null
  return {
    serviceId: followOn.id,
    serviceName: String(followOn.name || 'Follow-on'),
    therapyModality: String(followOn.slug || 'support'),
    blockRole: followOnBlockRole(followOn.service_type),
    durationMinutes: duration,
  }
}

export type FollowOnWrite = {
  keepId: string | null
  deleteIds: string[]
  insert: boolean
  plan: FollowOnPlan | null
}

/** Decide how an existing follow-on child should change after the parent write. */
export function planFollowOnWrite(
  existingChildIds: string[],
  plan: FollowOnPlan | null,
): FollowOnWrite {
  if (!plan) {
    return { keepId: null, deleteIds: [...existingChildIds], insert: false, plan: null }
  }
  if (!existingChildIds.length) {
    return { keepId: null, deleteIds: [], insert: true, plan }
  }
  const [keepId, ...rest] = existingChildIds
  return { keepId, deleteIds: rest, insert: false, plan }
}
