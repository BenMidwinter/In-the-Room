import { describe, it, expect } from 'vitest'
import {
  PRIVATE_PRACTICE_LOCATION_ID,
  applyDayHoursWithOverlapResolution,
  buildClinicianLocations,
  defaultWeeklyHours,
  formatWeeklyHoursSummary,
  mergeSettingsForLocations,
  normalizeWorkplaceSettings,
  resolveOfferedServiceNames,
} from './clinicianAvailability'

describe('clinicianAvailability', () => {
  it('includes private practice as a configurable location', () => {
    const locations = buildClinicianLocations(
      [{ workplace_id: 'wp-chroma', name: 'Chroma Main HQ', role: 'clinical_lead' }],
      new Map([['wp-chroma', { name: 'Chroma Main HQ' }]]),
    )
    expect(locations).toHaveLength(2)
    expect(locations[1].id).toBe(PRIVATE_PRACTICE_LOCATION_ID)
  })

  it('summarises a standard weekday range', () => {
    const summary = formatWeeklyHoursSummary(defaultWeeklyHours())
    expect(summary).toContain('Mon–Fri')
    expect(summary).toContain('9am')
    expect(summary).toContain('5pm')
  })

  it('merges stored settings with all active locations', () => {
    const merged = mergeSettingsForLocations(
      normalizeWorkplaceSettings([
        {
          workplace_id: 'wp-chroma',
          weekly_hours: defaultWeeklyHours(),
          service_ids: ['svc-1'],
        },
      ]),
      ['wp-chroma', 'private'],
    )
    expect(merged).toHaveLength(2)
    expect(merged[1].workplace_id).toBe('private')
    expect(merged[1].service_ids).toEqual([])
  })

  it('resolves offered service names from org catalogue ids', () => {
    const names = resolveOfferedServiceNames(
      { workplace_id: 'wp-chroma', weekly_hours: defaultWeeklyHours(), service_ids: ['svc-1', 'svc-5'] },
      [
        { id: 'svc-1', name: 'Music Therapy' },
        { id: 'svc-5', name: 'Somatic Expression' },
      ],
    )
    expect(names).toEqual(['Music Therapy', 'Somatic Expression'])
  })

  it('disables overlapping hours at other locations when editing the latest selection', () => {
    const base = mergeSettingsForLocations([], ['wp-chroma', 'wp-east'])
    const withHours = base.map((setting, index) => ({
      ...setting,
      weekly_hours: {
        ...setting.weekly_hours,
        tue: {
          enabled: true,
          start: index === 0 ? '09:00' : '10:00',
          end: index === 0 ? '17:00' : '16:00',
        },
      },
    }))

    const { settings, cleared } = applyDayHoursWithOverlapResolution(
      withHours,
      'wp-chroma',
      'tue',
      { enabled: true, start: '09:00', end: '17:00' },
    )

    expect(cleared).toHaveLength(1)
    expect(cleared[0].workplace_id).toBe('wp-east')
    expect(settings.find(s => s.workplace_id === 'wp-east')?.weekly_hours.tue.enabled).toBe(false)
  })
})
