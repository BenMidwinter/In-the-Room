import { describe, it, expect } from 'vitest'
import {
  tagsFromProfileValue,
  getClinicalProfileTagLabels,
  getClinicalProfileInsightSections,
  clinicalProfileMergeValues,
} from './clinicalProfile'

describe('tagsFromProfileValue', () => {
  it('parses comma tags and guards blanks', () => {
    expect(tagsFromProfileValue('calm, rhythm, drums')).toEqual(['calm', 'rhythm', 'drums'])
    expect(tagsFromProfileValue('')).toEqual([])
    expect(tagsFromProfileValue(undefined)).toEqual([])
  })
})

describe('getClinicalProfileTagLabels', () => {
  it('flattens and dedupes across tag fields', () => {
    const cp = {
      sensory_considerations: 'loud, bright',
      recurring_themes: 'bright, water',
      clinical_goals: 'water, turn-taking',
    }
    expect(getClinicalProfileTagLabels(cp)).toEqual(['loud', 'bright', 'water', 'turn-taking'])
  })
  it('returns [] for empty profile', () => {
    expect(getClinicalProfileTagLabels(null)).toEqual([])
  })
})

describe('getClinicalProfileInsightSections', () => {
  it('emits sections only for populated fields', () => {
    const sections = getClinicalProfileInsightSections({ recurring_themes: 'a, b' })
    expect(sections).toHaveLength(1)
    expect(sections[0].key).toBe('recurring_themes')
    expect(sections[0].title).toBe('Themes & metaphors')
    expect(sections[0].items).toHaveLength(2)
    expect(sections[0].items[0].source).toBe('profile')
  })
  it('treats working_formulation as a single non-tag item', () => {
    const sections = getClinicalProfileInsightSections({ working_formulation: 'Longer prose note.' })
    expect(sections).toHaveLength(1)
    expect(sections[0].items).toHaveLength(1)
    expect(sections[0].items[0].label).toBe('Longer prose note.')
  })
  it('returns [] for null profile', () => {
    expect(getClinicalProfileInsightSections(null)).toEqual([])
  })
})

describe('clinicalProfileMergeValues', () => {
  it('maps client + clinical_profile into merge values', () => {
    const client = {
      diagnosis: 'ASD',
      medication: 'None',
      school: 'Oak Academy',
      clinical_profile: {
        recurring_themes: 'water',
        working_formulation: 'Formulation text',
        preferred_modalities_notes: 'improvisation',
      },
    }
    const values = clinicalProfileMergeValues(client)
    expect(values.client_diagnosis).toBe('ASD')
    expect(values.client_school).toBe('Oak Academy')
    expect(values.recurring_themes).toBe('water')
    expect(values.working_formulation).toBe('Formulation text')
    expect(values.preferred_modalities).toBe('improvisation')
  })
  it('defaults missing values to empty strings', () => {
    const values = clinicalProfileMergeValues(null)
    expect(values.client_diagnosis).toBe('')
    expect(values.recurring_themes).toBe('')
  })
})
