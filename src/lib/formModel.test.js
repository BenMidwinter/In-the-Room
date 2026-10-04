import { describe, expect, it } from 'vitest'
import {
  blankMeasure,
  clientPatchFromAnswers,
  measureEditIsBlocked,
  measureScoresCsv,
  measureStructureKey,
  validateMeasure,
  outcomesInForm,
  prefillClientAnswers,
  scoreMeasure,
} from './formModel'

describe('outcome scores', () => {
  it('sums a questionnaire into one total and keeps each statement', () => {
    const schema = {
      v: 1,
      kind: 'items',
      min: 0,
      max: 4,
      items: [
        { id: 'a', label: 'Edgy' },
        { id: 'b', label: 'Unhappy' },
      ],
    }
    expect(scoreMeasure(schema, { a: 2, b: 4 })).toEqual({ total: 6, items: { a: 2, b: 4 } })
    expect(() => scoreMeasure(schema, { a: 2 })).toThrow(/each statement/i)
    expect(() => scoreMeasure(schema, { a: 9, b: 1 })).toThrow(/0 to 4/)
  })

  it('keeps a single global score, such as CGAS, as one number', () => {
    const schema = blankMeasure('overall')
    expect(scoreMeasure(schema, { score: 65 }).total).toBe(65)
    expect(scoreMeasure({ ...schema, min: 1, max: 100 }, 40).total).toBe(40)
  })

  it('lets wording change after scores exist, and blocks a changed scale', () => {
    const previous = {
      v: 1,
      kind: 'items',
      min: 0,
      max: 4,
      items: [{ id: 'a', label: 'Edgy' }],
    }
    const reworded = { ...previous, items: [{ id: 'a', label: 'I have felt edgy' }] }
    expect(measureEditIsBlocked(previous, reworded, true)).toBe(false)
    expect(measureStructureKey(previous)).toBe(measureStructureKey(reworded))
    expect(measureEditIsBlocked(previous, { ...previous, max: 5 }, true)).toBe(true)
    expect(measureEditIsBlocked(previous, { ...previous, max: 5 }, false)).toBe(false)
  })

  it('writes one outcome per questionnaire on a form, and client details separately', () => {
    const form = {
      v: 1,
      blocks: [
        { id: 'meds', type: 'client', bind: 'medication', label: 'Medication' },
        { id: 'q', type: 'measure', measureId: 'yp' },
      ],
    }
    const measures = {
      yp: { v: 1, kind: 'items', min: 0, max: 4, items: [{ id: 'a', label: 'Edgy' }] },
    }
    expect(outcomesInForm(form, measures, { meds: 'sertraline', q: { a: 3 } })).toEqual([
      { measureId: 'yp', total: 3, items: { a: 3 } },
    ])
    expect(clientPatchFromAnswers(form, { meds: 'sertraline' })).toEqual({ medication: 'sertraline' })
    expect(prefillClientAnswers(form, { medication: 'sertraline' })).toEqual({ meds: 'sertraline' })
  })

  it('asks for a name and a statement before a questionnaire can be saved', () => {
    const schema = blankMeasure('items')
    expect(validateMeasure('', schema)).toMatch(/name/i)
    expect(validateMeasure('YP-CORE', schema)).toMatch(/statement/i)
  })

  it('exports one row per completion with date of birth and gender, and no population cutoff', () => {
    const schema = {
      v: 1,
      kind: 'items',
      min: 0,
      max: 4,
      items: [{ id: 'a', label: 'I have felt edgy' }],
    }
    const csv = measureScoresCsv(schema, [
      { recordedOn: '2026-04-02', clientName: 'Ada North', dob: '2014-03-01', gender: 'Female', total: 3, items: { a: 3 } },
    ])
    expect(csv).toContain('Date,Client,Date of birth,Gender,Score,I have felt edgy')
    expect(csv).toContain('2026-04-02,Ada North,2014-03-01,Female,3,3')
    expect(csv.toLowerCase()).not.toContain('cutoff')
    expect(csv.toLowerCase()).not.toContain('clinical')
  })
})
