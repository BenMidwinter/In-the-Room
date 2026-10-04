import { describe, expect, it } from 'vitest'
import {
  buildPermissions,
  canAccessClient,
  canAccessClientNavSection,
  canAssignAppointmentClinician,
  filterClientsForUser,
} from './permissions'

describe('owner access', () => {
  const own = { id: 'c1', user_id: 'user-1' }
  const other = { id: 'c2', user_id: 'user-2' }

  it('keeps a clinician on their own clients', () => {
    expect(canAccessClient(own, 'user-1')).toBe(true)
    expect(canAccessClient(other, 'user-1')).toBe(false)
    expect(filterClientsForUser([own, other], 'user-1')).toEqual([own])
  })

  it('shows client sections only for owned records', () => {
    expect(canAccessClientNavSection('appointments', null, own, 'user-1')).toBe(true)
    expect(canAccessClientNavSection('appointments', null, other, 'user-1')).toBe(false)
  })

  it('does not offer a team clinician picker', () => {
    expect(canAssignAppointmentClinician()).toBe(false)
  })

  it('allows the owner to write notes and edit details', () => {
    const perms = buildPermissions(null, own, 'user-1')
    expect(perms.canWriteProgressNotes).toBe(true)
    expect(perms.canEditClientDetails).toBe(true)
    expect(perms.canAddPrivateClient).toBe(true)
    expect(perms.canAddWorkplaceClient).toBe(false)
  })
})
