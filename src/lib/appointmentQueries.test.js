import { describe, expect, it } from 'vitest'
import { appointmentQueryKeys } from './appointmentQueries'

describe('appointmentQueryKeys', () => {
  it('builds stable client and detail keys', () => {
    expect(appointmentQueryKeys.client('c1')).toEqual(['appointments', 'client', 'c1'])
    expect(appointmentQueryKeys.detail('a1')).toEqual(['appointments', 'detail', 'a1'])
  })

  it('includes scope in upcoming keys', () => {
    expect(appointmentQueryKeys.upcoming('u1', 'wp1', false)).toEqual([
      'appointments',
      'upcoming',
      { userId: 'u1', workplaceId: 'wp1', organisationWide: false },
    ])
    expect(appointmentQueryKeys.upcoming('u1', null, true)).toEqual([
      'appointments',
      'upcoming',
      { userId: 'u1', workplaceId: null, organisationWide: true },
    ])
  })
})
