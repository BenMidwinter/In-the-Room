import { compareYmd } from './dateArchitecture'

export type SeriesScope = 'this' | 'following' | 'all'

function isPrimarySession(appointment: {
  block_role?: string | null
  parent_appointment_id?: string | null
  is_external_busy?: boolean
}) {
  if (appointment.is_external_busy) return false
  if (appointment.parent_appointment_id) return false
  const role = appointment.block_role || 'client_session'
  return role === 'client_session'
}

function seriesKey(appointment: {
  client_id?: string | null
  clinician_id?: string | null
  start_time?: string | null
  end_time?: string | null
  service_id?: string | null
  therapy_modality?: string | null
}) {
  return [
    appointment.client_id || '',
    appointment.clinician_id || '',
    appointment.start_time || '',
    appointment.end_time || '',
    appointment.service_id || appointment.therapy_modality || '',
  ].join('|')
}

/** Primary sessions that belong with this appointment (explicit series_id or heuristic). */
export function findSeriesSiblings<T extends {
  id: string
  series_id?: string | null
  session_date?: string
  client_id?: string | null
  clinician_id?: string | null
  start_time?: string | null
  end_time?: string | null
  service_id?: string | null
  therapy_modality?: string | null
  block_role?: string | null
  parent_appointment_id?: string | null
}>(appointment: T | null | undefined, allAppointments: T[] = []): T[] {
  if (!appointment?.id) return []
  const pool = allAppointments.filter(isPrimarySession)

  if (appointment.series_id) {
    return pool
      .filter((a) => a.series_id === appointment.series_id)
      .sort((a, b) => compareYmd(a.session_date || '', b.session_date || ''))
  }

  const key = seriesKey(appointment)
  const siblings = pool
    .filter((a) => seriesKey(a) === key)
    .sort((a, b) => compareYmd(a.session_date || '', b.session_date || ''))

  // Only treat as a series when there is more than one matching session.
  if (siblings.length < 2) {
    return pool.filter((a) => a.id === appointment.id)
  }
  return siblings
}

export function appointmentBelongsToSeries(
  appointment: { series_id?: string | null; id?: string } | null | undefined,
  allAppointments: unknown[] = [],
): boolean {
  return findSeriesSiblings(appointment as never, allAppointments as never[]).length > 1
}

/** Resolve which appointments a scope covers (primary sessions only). */
export function resolveSeriesScopeIds<T extends {
  id: string
  session_date?: string
  series_id?: string | null
}>(
  appointment: T,
  allAppointments: T[],
  scope: SeriesScope,
): string[] {
  const siblings = findSeriesSiblings(appointment, allAppointments)
  if (scope === 'this' || siblings.length <= 1) return [appointment.id]
  if (scope === 'all') return siblings.map((a) => a.id)
  const fromDate = appointment.session_date || ''
  return siblings
    .filter((a) => compareYmd(a.session_date || '', fromDate) >= 0)
    .map((a) => a.id)
}

export function countSeriesScope(
  appointment: { id: string; session_date?: string; series_id?: string | null },
  allAppointments: { id: string; session_date?: string; series_id?: string | null }[],
  scope: SeriesScope,
): number {
  return resolveSeriesScopeIds(appointment, allAppointments, scope).length
}
