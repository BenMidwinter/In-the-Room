import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, getUpcomingAppointments } from '../store'

beforeEach(() => {
  resetStore()
})

describe('getUpcomingAppointments', () => {
  it('returns an empty list when the practice has no bookings', () => {
    expect(getUpcomingAppointments('user-1', null)).toEqual([])
    expect(getUpcomingAppointments('user-1', null, { organisationWide: true })).toEqual([])
  })
})
