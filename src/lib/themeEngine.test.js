import { describe, expect, it } from 'vitest'
import { resolveThemeId } from './themeEngine'

describe('reading themes', () => {
  it('keeps a theme the person already chose', () => {
    expect(resolveThemeId('practice', null, true)).toBe('practice')
    expect(resolveThemeId('somatic-open', null, true)).toBe('somatic-open')
  })

  it('uses high contrast when the computer asks and no theme is stored', () => {
    expect(resolveThemeId(null, null, true)).toBe('reading-contrast')
    expect(resolveThemeId(null, null, false)).toBe('practice')
  })

  it('keeps an old somatic choice ahead of the contrast request', () => {
    expect(resolveThemeId(null, 'grounded', true)).toBe('somatic-grounded')
  })
})
