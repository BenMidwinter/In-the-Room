import { describe, expect, it } from 'vitest'
import { applyConcession, concessionPhrase, sessionBasePence } from './sessionPrice'

describe('session price', () => {
  it('takes a percentage or an amount off the service price', () => {
    const student = { kind: 'percent', percent: 20, amountPence: null, label: 'Student' }
    expect(applyConcession(8000, student)).toBe(6400)
    expect(concessionPhrase(student)).toBe('Student 20%')
    const amount = { kind: 'amount', percent: null, amountPence: 1500, label: '' }
    expect(applyConcession(8000, amount)).toBe(6500)
    expect(concessionPhrase(amount)).toBe('£15.00 off')
    expect(applyConcession(8000, { kind: 'none', percent: null, amountPence: null, label: '' })).toBe(8000)
  })

  it('lets a custom session price replace the concession', () => {
    const student = { kind: 'percent', percent: 20, amountPence: null, label: 'Student' }
    expect(sessionBasePence({ feePence: 8000, overridePence: 5000, concession: student })).toEqual({
      pence: 5000,
      phrase: 'this session',
    })
    expect(sessionBasePence({ feePence: 8000, overridePence: null, concession: student })).toEqual({
      pence: 6400,
      phrase: 'Student 20%',
    })
  })
})
