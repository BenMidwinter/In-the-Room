import { describe, expect, it } from 'vitest'
import { feePenceToInput, formatServiceFee, parseFeePounds } from './money'

describe('service fees', () => {
  it('stores a blank price as no fee', () => {
    expect(parseFeePounds('')).toEqual({ pence: null, error: null })
    expect(parseFeePounds('  ')).toEqual({ pence: null, error: null })
  })

  it('stores pounds as whole pence', () => {
    expect(parseFeePounds('80').pence).toBe(8000)
    expect(parseFeePounds('80.5').pence).toBe(8050)
    expect(parseFeePounds('80.55').pence).toBe(8055)
  })

  it('rejects a price that is not pounds and pence', () => {
    expect(parseFeePounds('80.555').error).toMatch(/pounds/)
    expect(parseFeePounds('-10').error).toMatch(/pounds/)
  })

  it('shows an inclusive price beside the amount', () => {
    expect(formatServiceFee(8000, false)).toBe('£80.00')
    expect(formatServiceFee(8000, true)).toBe('£80.00 incl. VAT')
    expect(formatServiceFee(null, true)).toBe('')
    expect(feePenceToInput(8050)).toBe('80.50')
  })
})
