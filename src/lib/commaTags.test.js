import { describe, it, expect } from 'vitest'
import { parseCommaTags, joinCommaTags } from './commaTags'

describe('parseCommaTags', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseCommaTags('a, b ,  c ,,')).toEqual(['a', 'b', 'c'])
  })
  it('returns [] for blank input', () => {
    expect(parseCommaTags('')).toEqual([])
    expect(parseCommaTags('   ')).toEqual([])
    expect(parseCommaTags(null)).toEqual([])
  })
})

describe('joinCommaTags', () => {
  it('joins with ", " and filters falsy', () => {
    expect(joinCommaTags(['a', '', 'b', null, 'c'])).toBe('a, b, c')
  })
  it('round-trips with parseCommaTags', () => {
    expect(parseCommaTags(joinCommaTags(['x', 'y', 'z']))).toEqual(['x', 'y', 'z'])
  })
})
