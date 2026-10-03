import { describe, expect, it } from 'vitest'
import {
  appointmentBelongsToSeries,
  countSeriesScope,
  findSeriesSiblings,
  resolveSeriesScopeIds,
} from './appointmentSeries'

const series = [
  { id: 'a1', series_id: 's1', session_date: '2026-10-03', client_id: 'c1', clinician_id: 'u1', start_time: '09:00', end_time: '10:00', service_id: 'svc', block_role: 'client_session' },
  { id: 'a2', series_id: 's1', session_date: '2026-10-10', client_id: 'c1', clinician_id: 'u1', start_time: '09:00', end_time: '10:00', service_id: 'svc', block_role: 'client_session' },
  { id: 'a3', series_id: 's1', session_date: '2026-10-17', client_id: 'c1', clinician_id: 'u1', start_time: '09:00', end_time: '10:00', service_id: 'svc', block_role: 'client_session' },
  { id: 'f2', series_id: null, parent_appointment_id: 'a2', session_date: '2026-10-10', client_id: 'c1', clinician_id: 'u1', start_time: '10:00', end_time: '10:10', service_id: 'notes', block_role: 'admin' },
]

describe('appointmentSeries', () => {
  it('finds siblings by series_id and ignores follow-ons', () => {
    expect(findSeriesSiblings(series[1], series).map((a) => a.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('resolves this / following / all scopes', () => {
    expect(resolveSeriesScopeIds(series[1], series, 'this')).toEqual(['a2'])
    expect(resolveSeriesScopeIds(series[1], series, 'following')).toEqual(['a2', 'a3'])
    expect(resolveSeriesScopeIds(series[1], series, 'all')).toEqual(['a1', 'a2', 'a3'])
    expect(countSeriesScope(series[1], series, 'following')).toBe(2)
  })

  it('uses heuristic match when series_id is missing', () => {
    const loose = series.map((a) => ({ ...a, series_id: null }))
    expect(appointmentBelongsToSeries(loose[0], loose)).toBe(true)
    expect(resolveSeriesScopeIds(loose[0], loose, 'all')).toHaveLength(3)
  })
})
