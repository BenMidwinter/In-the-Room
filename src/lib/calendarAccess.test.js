import { describe, expect, it } from 'vitest'
import { appointmentMatchesPersona, filterAppointmentsForPersona } from './calendarAccess'

const persona = {
  id: 'user-1',
  userId: 'user-1',
  name: 'Alex Rivera',
}

describe('appointmentMatchesPersona', () => {
  it('matches by clinician id even when the display name is stale', () => {
    expect(appointmentMatchesPersona({
      clinician_id: 'user-1',
      assigned_therapist: 'Clinician',
    }, persona)).toBe(true)
  })

  it('matches full display name or first name', () => {
    expect(appointmentMatchesPersona({
      clinician_id: 'other',
      assigned_therapist: 'Alex Rivera',
    }, persona)).toBe(true)
    expect(appointmentMatchesPersona({
      clinician_id: 'other',
      assigned_therapist: 'Alex',
    }, persona)).toBe(true)
  })

  it('rejects appointments for another clinician', () => {
    expect(appointmentMatchesPersona({
      clinician_id: 'user-other',
      assigned_therapist: 'Clinician',
    }, persona)).toBe(false)
  })
})

describe('filterAppointmentsForPersona', () => {
  it('keeps own sessions and drops others', () => {
    const rows = [
      { id: '1', clinician_id: 'user-1', assigned_therapist: 'Clinician' },
      { id: '2', clinician_id: 'user-other', assigned_therapist: 'Clinician' },
    ]
    expect(filterAppointmentsForPersona(rows, persona).map((r) => r.id)).toEqual(['1'])
  })
})
