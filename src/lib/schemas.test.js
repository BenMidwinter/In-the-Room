import { describe, it, expect } from 'vitest'
import {
  parseOrThrow,
  clientInputSchema,
  appointmentInputSchema,
  progressNoteInputSchema,
  journalEntryInputSchema,
  clientClinicalDetailsSchema,
  clinicalProfileInputSchema,
} from './schemas'

describe('parseOrThrow + clientInputSchema', () => {
  it('accepts and trims a valid client payload', () => {
    const out = parseOrThrow(clientInputSchema, {
      first_name: '  Jo  ',
      surname: 'Bloggs',
      dob: '2015-04-01',
    }, 'Client')
    expect(out.first_name).toBe('Jo')
    expect(out.surname).toBe('Bloggs')
  })
  it('rejects a blank name with a readable message', () => {
    expect(() => parseOrThrow(clientInputSchema, { first_name: '   ', surname: 'X', dob: '2015-04-01' }, 'Client'))
      .toThrow(/First name is required/)
  })
  it('rejects a malformed dob', () => {
    expect(() => parseOrThrow(clientInputSchema, { first_name: 'Jo', surname: 'X', dob: 'nope' }, 'Client'))
      .toThrow(/Date of birth/)
  })
})

describe('appointmentInputSchema', () => {
  it('accepts a valid appointment and coerces duration', () => {
    const out = parseOrThrow(appointmentInputSchema, {
      client_id: 'client-1',
      session_date: '2026-07-02',
      start_time: '09:00',
      duration_minutes: '45',
      appointment_type: 'one_to_one',
    }, 'Appointment')
    expect(out.duration_minutes).toBe(45)
  })
  it('requires a client on create', () => {
    expect(() => parseOrThrow(appointmentInputSchema, { session_date: '2026-07-02' }, 'Appointment'))
      .toThrow(/client is required/i)
  })
  it('requires a date on create', () => {
    expect(() => parseOrThrow(appointmentInputSchema, { client_id: 'client-1' }, 'Appointment'))
      .toThrow(/date is required/i)
  })
  it('rejects an unknown appointment type', () => {
    expect(() => parseOrThrow(appointmentInputSchema, {
      client_id: 'client-1', session_date: '2026-07-02', appointment_type: 'bogus',
    }, 'Appointment')).toThrow()
  })
})

describe('progressNoteInputSchema', () => {
  it('requires a client (or id) to create', () => {
    expect(() => parseOrThrow(progressNoteInputSchema, { title: 'Note' }, 'Progress note'))
      .toThrow(/client is required/i)
  })
  it('accepts an update by id', () => {
    const out = parseOrThrow(progressNoteInputSchema, { id: 'note-1', title: 'Edited' }, 'Progress note')
    expect(out.id).toBe('note-1')
  })
})

describe('journalEntryInputSchema', () => {
  it('accepts a valid journal entry', () => {
    const out = parseOrThrow(journalEntryInputSchema, {
      date: '2026-07-01',
      time: '09:30',
      somatic_state: 'Grounded',
    }, 'Journal entry')
    expect(out.date).toBe('2026-07-01')
  })
  it('rejects invalid somatic states', () => {
    expect(() => parseOrThrow(journalEntryInputSchema, {
      date: '2026-07-01',
      somatic_state: 'wired',
    }, 'Journal entry')).toThrow()
  })
})

describe('clientClinicalDetailsSchema', () => {
  it('trims optional clinical detail fields', () => {
    const out = parseOrThrow(clientClinicalDetailsSchema, {
      diagnosis: '  ASD  ',
      school: ' Riverside ',
    }, 'Clinical details')
    expect(out.diagnosis).toBe('ASD')
    expect(out.school).toBe('Riverside')
  })
})

describe('clinicalProfileInputSchema', () => {
  it('accepts partial profile updates', () => {
    const out = parseOrThrow(clinicalProfileInputSchema, {
      working_formulation: 'Anxiety linked to transitions',
    }, 'Clinical profile')
    expect(out.working_formulation).toContain('Anxiety')
  })
})
