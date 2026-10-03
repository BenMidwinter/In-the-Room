import { describe, expect, it } from 'vitest'
import { appointmentMatchesPersona, filterAppointmentsForPersona } from './calendarAccess'
import { ROLES } from './permissions'

const persona = {
  id: 'clinician',
  userId: 'user-ben',
  name: 'Ben Richardson',
  role: ROLES.CLINICIAN,
}

describe('appointmentMatchesPersona', () => {
  it('matches by clinician_id even when assigned_therapist is a stale fallback', () => {
    expect(appointmentMatchesPersona({
      clinician_id: 'user-ben',
      assigned_therapist: 'Clinician',
    }, persona)).toBe(true)
  })

  it('matches full display name or first name', () => {
    expect(appointmentMatchesPersona({
      clinician_id: 'other',
      assigned_therapist: 'Ben Richardson',
    }, persona)).toBe(true)
    expect(appointmentMatchesPersona({
      clinician_id: 'other',
      assigned_therapist: 'Ben',
    }, persona)).toBe(true)
  })

  it('rejects appointments for another clinician', () => {
    expect(appointmentMatchesPersona({
      clinician_id: 'user-other',
      assigned_therapist: 'Clinician',
    }, persona)).toBe(false)
  })

  it('lets leads see every appointment', () => {
    expect(appointmentMatchesPersona(
      { clinician_id: 'x', assigned_therapist: 'Y' },
      { ...persona, role: ROLES.SERVICE_LEAD },
    )).toBe(true)
  })
})

describe('filterAppointmentsForPersona', () => {
  it('keeps own sessions and drops others', () => {
    const rows = [
      { id: '1', clinician_id: 'user-ben', assigned_therapist: 'Clinician' },
      { id: '2', clinician_id: 'user-other', assigned_therapist: 'Clinician' },
    ]
    expect(filterAppointmentsForPersona(rows, persona).map((r) => r.id)).toEqual(['1'])
  })
})
