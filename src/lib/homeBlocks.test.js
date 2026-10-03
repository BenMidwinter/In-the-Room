import { describe, expect, it } from 'vitest'
import { db } from './data/collections'
import {
  appointmentAssignedToClinician,
  filterHomeOversightWorkplaces,
  getPersonalUpcomingAppointments,
  getPersonalActiveCases,
  getWorkplaceUpcomingAppointments,
  getWorkplaceActiveCases,
} from './homeBlocks'
import { getWorkplaceContextsForUser } from './store'

describe('homeBlocks assignment filters', () => {
  it('matches appointments by clinician_id or assigned_therapist name', () => {
    expect(appointmentAssignedToClinician(
      { clinician_id: 'user-sarah', assigned_therapist: 'Sarah' },
      'user-sarah',
      'Sarah',
    )).toBe(true)
    expect(appointmentAssignedToClinician(
      { clinician_id: 'user-sarah', assigned_therapist: 'Sarah' },
      'user-ben',
      'Ben',
    )).toBe(false)
    expect(appointmentAssignedToClinician(
      { assigned_therapist: 'Ben' },
      'user-ben',
      'Ben',
    )).toBe(true)
  })

  it('returns only Sarah personal upcoming at Chroma', () => {
    const upcoming = getPersonalUpcomingAppointments('user-sarah', 'Sarah', 'wp-chroma')
    expect(upcoming.length).toBeGreaterThan(0)
    expect(upcoming.every(a => a.assigned_therapist === 'Sarah')).toBe(true)
  })

  it('returns Ben personal upcoming across all workplaces when unscoped', () => {
    const chromaOnly = getPersonalUpcomingAppointments('user-ben', 'Ben', 'wp-chroma')
    const allSites = getPersonalUpcomingAppointments('user-ben', 'Ben', null)
    expect(allSites.length).toBeGreaterThanOrEqual(chromaOnly.length)
    expect(allSites.some(a => a.client_id === 'client-5')).toBe(true)
  })

  it('lists leadership workplaces for Ben without using global context', () => {
    const contexts = getWorkplaceContextsForUser('user-ben')
    const oversight = filterHomeOversightWorkplaces(contexts)
    expect(oversight).toHaveLength(2)
    expect(oversight.map(w => w.id).sort()).toEqual(['wp-chroma', 'wp-east'])
  })

  it('returns only Ben personal active cases', () => {
    const cases = getPersonalActiveCases('user-ben', 'wp-chroma')
    expect(cases.every(c => c.user_id === 'user-ben')).toBe(true)
  })

  it('returns workplace-wide upcoming and cases for Chroma', () => {
    const upcoming = getWorkplaceUpcomingAppointments('wp-chroma')
    const cases = getWorkplaceActiveCases('wp-chroma')

    expect(upcoming.length).toBeGreaterThan(0)
    expect(cases.length).toBeGreaterThan(0)

    expect(upcoming.every((appt) => {
      const client = db.clients.find(c => c.id === appt.client_id)
      return client?.workplace_id === 'wp-chroma'
    })).toBe(true)

    expect(cases.every(c => c.workplace_id === 'wp-chroma' && c.is_active)).toBe(true)

    const benCases = getPersonalActiveCases('user-ben', 'wp-chroma')
    const sarahCases = getPersonalActiveCases('user-sarah', 'wp-chroma')
    expect(benCases.length + sarahCases.length).toBeGreaterThanOrEqual(cases.length)
  })
})
