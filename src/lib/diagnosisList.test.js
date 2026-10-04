import { describe, expect, it } from 'vitest'
import { joinDiagnosisList, parseDiagnosisList } from './diagnosisList'

describe('diagnosis list', () => {
  it('keeps Social Emotional and Mental Health as one diagnosis', () => {
    expect(parseDiagnosisList(
      'Social, Emotional and Mental Health (SEMH), Speech, Language and Communication Needs (SLCN), ADHD',
    )).toEqual([
      'Social Emotional and Mental Health (SEMH)',
      'Speech Language and Communication Needs (SLCN)',
      'ADHD',
    ])
  })

  it('strips commas from a custom diagnosis before saving', () => {
    expect(joinDiagnosisList(['Anxiety', 'Social, emotional needs'])).toBe(
      'Anxiety, Social emotional needs',
    )
  })
})
