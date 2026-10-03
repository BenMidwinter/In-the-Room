import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetStore,
  getClientTimeline,
  updateClientClinicalProfile,
  updateClientClinicalDetails,
} from '../store'

beforeEach(() => {
  resetStore()
})

describe('getClientTimeline', () => {
  it('merges timeline events, progress notes, and working documents', () => {
    const events = getClientTimeline('client-1')
    expect(events.length).toBeGreaterThan(0)
    const types = new Set(events.map(e => e.type))
    expect(types.has('note') || types.has('document') || types.has('event')).toBe(true)
    for (let i = 1; i < events.length; i += 1) {
      expect(new Date(events[i - 1].created_at) >= new Date(events[i].created_at)).toBe(true)
    }
  })

  it('strips HTML from note summaries', () => {
    const events = getClientTimeline('client-1')
    const noteEvent = events.find(e => e.type === 'note')
    if (noteEvent?.summary) {
      expect(noteEvent.summary).not.toMatch(/<[^>]+>/)
    }
  })
})

describe('updateClientClinicalProfile', () => {
  it('deep-merges profile fields without dropping existing keys', () => {
    updateClientClinicalProfile('client-1', {
      recurring_themes: 'water, journey',
    })
    const updated = updateClientClinicalProfile('client-1', {
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
    const updated = updateClientClinicalDetails('client-1', {
      diagnosis: 'Updated diagnosis',
      medication: 'None',
    })
    expect(updated.diagnosis).toBe('Updated diagnosis')
    expect(updated.medication).toBe('None')
  })
})
