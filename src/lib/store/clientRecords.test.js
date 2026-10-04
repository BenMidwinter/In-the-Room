import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetStore,
  upsertClient,
  saveProgressNote,
  getClientTimeline,
  updateClientClinicalProfile,
  updateClientClinicalDetails,
} from '../store'

function seedClient() {
  return upsertClient({
    first_name: 'Ada',
    surname: 'Client',
    dob: '2012-01-01',
  }, 'user-1')
}

beforeEach(() => {
  resetStore()
})

describe('getClientTimeline', () => {
  it('merges timeline events, Process Notes, and working documents', () => {
    const client = seedClient()
    saveProgressNote({
      client_id: client.id,
      title: 'Session note',
      content: '<p>Held the room quietly.</p>',
      session_date: '2026-10-01',
    }, 'user-1')
    const events = getClientTimeline(client.id)
    expect(events.length).toBeGreaterThan(0)
    const types = new Set(events.map(e => e.type))
    expect(types.has('note') || types.has('document') || types.has('event')).toBe(true)
    for (let i = 1; i < events.length; i += 1) {
      expect(new Date(events[i - 1].created_at) >= new Date(events[i].created_at)).toBe(true)
    }
  })

  it('strips HTML from note summaries', () => {
    const client = seedClient()
    saveProgressNote({
      client_id: client.id,
      title: 'Session note',
      content: '<p>Held the room quietly.</p>',
      session_date: '2026-10-01',
    }, 'user-1')
    const events = getClientTimeline(client.id)
    const noteEvent = events.find(e => e.type === 'note')
    if (noteEvent?.summary) {
      expect(noteEvent.summary).not.toMatch(/<[^>]+>/)
    }
  })

  it('includes support/admin appointments and keeps service titles when attended', () => {
    const events = getClientTimeline('client-1', {
      appointments: [
        {
          id: 'appt-support-1',
          client_id: 'client-1',
          block_role: 'admin',
          service_name: 'Notes',
          session_date: '2026-10-01',
          start_time: '10:00',
          attendance_status: null,
          clinician_id: 'u1',
        },
        {
          id: 'appt-attended-1',
          client_id: 'client-1',
          block_role: 'client_session',
          service_name: 'Music Therapy',
          therapy_modality: 't',
          session_date: '2026-10-02',
          start_time: '11:00',
          attendance_status: 'attended',
          clinician_id: 'u1',
        },
      ],
    })
    const support = events.find((e) => e.ref_id === 'appt-support-1')
    const attended = events.find((e) => e.ref_id === 'appt-attended-1')
    expect(support?.type).toBe('support')
    expect(support?.title).toBe('Notes')
    expect(attended?.title).toBe('Music Therapy')
  })
})

describe('updateClientClinicalProfile', () => {
  it('deep-merges profile fields without dropping existing keys', () => {
    const client = seedClient()
    updateClientClinicalProfile(client.id, {
      recurring_themes: 'water, journey',
    })
    const updated = updateClientClinicalProfile(client.id, {
      clinical_goals: 'regulation',
    })
    expect(updated.clinical_profile?.recurring_themes).toContain('water')
    expect(updated.clinical_profile?.clinical_goals).toBe('regulation')
  })

  it('rejects invalid profile payloads', () => {
    expect(() => updateClientClinicalProfile('client-1', {
      recurring_themes: 123,
    })).toThrow(/Clinical profile/)
  })
})

describe('updateClientClinicalDetails', () => {
  it('updates diagnosis and medication fields', () => {
    const client = seedClient()
    const updated = updateClientClinicalDetails(client.id, {
      diagnosis: 'Updated diagnosis',
      medication: 'None',
    })
    expect(updated.diagnosis).toBe('Updated diagnosis')
    expect(updated.medication).toBe('None')
    const withGender = updateClientClinicalDetails(client.id, { gender: 'Female' })
    expect(withGender.gender).toBe('Female')
    expect(withGender.diagnosis).toBe('Updated diagnosis')
  })
})
