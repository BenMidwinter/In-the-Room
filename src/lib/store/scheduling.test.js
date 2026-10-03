import { describe, it, expect, beforeEach } from 'vitest'
import { DEMO_TODAY } from '../dateArchitecture'
import { resetStore, getUpcomingAppointments, getClientsForUser } from '../store'

beforeEach(() => {
  resetStore()
})

describe('getUpcomingAppointments', () => {
  it('excludes cancelled sessions and past dates', () => {
    const myWorkplace = { id: 'wp-chroma', role: 'clinical_lead' }
    const upcoming = getUpcomingAppointments('user-ben', myWorkplace)
    expect(upcoming.length).toBeGreaterThan(0)
    upcoming.forEach((appt) => {
      expect(appt.attendance_status).not.toBe('cancelled')
      expect(appt.session_date >= DEMO_TODAY).toBe(true)
    })
  })

  it('limits caseload appointments to the user workplace clients', () => {
    const myWorkplace = { id: 'wp-chroma', role: 'clinical_lead' }
    const caseloadIds = new Set(getClientsForUser('user-ben', myWorkplace).map(c => c.id))
    const upcoming = getUpcomingAppointments('user-ben', myWorkplace)
    upcoming.forEach((appt) => {
      expect(caseloadIds.has(appt.client_id)).toBe(true)
    })
  })

  it('returns organisation-wide appointments for service lead scope', () => {
    const myWorkplace = { id: 'wp-chroma', role: 'service_lead' }
    const caseload = getUpcomingAppointments('user-daniel', myWorkplace, { organisationWide: false })
    const orgWide = getUpcomingAppointments('user-daniel', myWorkplace, { organisationWide: true })
    expect(orgWide.length).toBeGreaterThanOrEqual(caseload.length)
  })
})
