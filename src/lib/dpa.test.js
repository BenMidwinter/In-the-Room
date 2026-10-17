import { describe, expect, it } from 'vitest'
import { DPA_VERSION, hasCurrentDpa } from './dpa'

describe('hasCurrentDpa', () => {
  it('accepts a new account stamped with the current version', () => {
    expect(hasCurrentDpa({ dpa_version: DPA_VERSION }, [])).toBe(true)
  })

  it('keeps an older profile acceptance until version 1.1 is recorded', () => {
    expect(hasCurrentDpa({ dpa_version: '1.0', dpa_accepted: true }, [
      { dpa_version: '1.0' },
    ])).toBe(false)
  })

  it('treats a later 1.1 row as current without replacing the earlier version', () => {
    expect(hasCurrentDpa({ dpa_version: '1.0' }, [
      { dpa_version: '1.0' },
      { dpa_version: '1.1' },
    ])).toBe(true)
  })
})
