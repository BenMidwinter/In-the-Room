import { describe, expect, it } from 'vitest'
import { resendReady } from './resendReady'

describe('resendReady', () => {
  it('needs both the Resend key and the from address', () => {
    expect(resendReady('', '')).toBe(false)
    expect(resendReady('re_test', '')).toBe(false)
    expect(resendReady('', 'notes@processandnote.app')).toBe(false)
    expect(resendReady('  re_test  ', ' notes@processandnote.app ')).toBe(true)
  })
})
