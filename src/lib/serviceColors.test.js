import { describe, it, expect } from 'vitest'
import {
  defaultServiceColor,
  normalizeServiceColor,
  serviceNameToSlug,
  DEFAULT_SERVICE_COLORS,
  SERVICE_COLOR_PRESETS,
} from './serviceColors'

describe('defaultServiceColor', () => {
  it('returns per-type defaults', () => {
    expect(defaultServiceColor('busy')).toBe(DEFAULT_SERVICE_COLORS.busy)
    expect(defaultServiceColor('admin')).toBe(DEFAULT_SERVICE_COLORS.admin)
  })
  it('falls back to the first preset for unknown types', () => {
    expect(defaultServiceColor('nope')).toBe(SERVICE_COLOR_PRESETS[0])
  })
})

describe('normalizeServiceColor', () => {
  it('lowercases valid 6-digit hex', () => {
    expect(normalizeServiceColor('#ABCDEF')).toBe('#abcdef')
    expect(normalizeServiceColor('  #557A61 ')).toBe('#557a61')
  })
  it('falls back to the type default for invalid input', () => {
    expect(normalizeServiceColor('#fff', 'admin')).toBe(DEFAULT_SERVICE_COLORS.admin)
    expect(normalizeServiceColor('red', 'busy')).toBe(DEFAULT_SERVICE_COLORS.busy)
    expect(normalizeServiceColor(null)).toBe(DEFAULT_SERVICE_COLORS.appointment)
  })
})

describe('serviceNameToSlug', () => {
  it('slugifies to lowercase underscore form', () => {
    expect(serviceNameToSlug('Music Therapy!')).toBe('music_therapy')
    expect(serviceNameToSlug('  Hello   World  ')).toBe('hello_world')
    expect(serviceNameToSlug('Already_ok')).toBe('already_ok')
  })
  it('handles empties', () => {
    expect(serviceNameToSlug('')).toBe('')
    expect(serviceNameToSlug(null)).toBe('')
  })
})
