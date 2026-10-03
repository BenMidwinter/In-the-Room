import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, updatePrivatePracticeBranding, getProfile } from './store'
import {
  DEFAULT_PRACTICE_LOGO_URL,
  DEFAULT_WORKPLACE_BRANDING,
  formatWorkplaceAddress,
  resolvePracticeBranding,
  resolveWorkplaceBranding,
} from './workplaceBranding'

describe('workplaceBranding', () => {
  beforeEach(() => {
    resetStore()
  })

  it('does not inject a default practice logo', () => {
    expect(DEFAULT_PRACTICE_LOGO_URL).toBe('')
    const branding = resolvePracticeBranding({ full_name: 'Test Clinician' })
    expect(branding.logo_url).toBe('')
    expect(branding.name).toBe('Test Clinician')
  })

  it('uses an empty logo when workplace has none', () => {
    const branding = resolveWorkplaceBranding({ name: 'Practice A' })
    expect(branding.logo_url).toBe('')
    expect(branding.name).toBe('Practice A')
  })

  it('formats a single-line postal address', () => {
    const line = formatWorkplaceAddress(resolveWorkplaceBranding({
      name: 'Test Site',
      address_line1: 'Test Site',
      address_line2: '1 High Street',
      address_line3: 'Leeds',
      postcode: 'LS1 1AA',
      country: 'United Kingdom',
    }))
    expect(line).toContain('1 High Street')
    expect(line).toContain('LS1 1AA')
    expect(line).toContain('United Kingdom')
  })

  it('stores private practice branding without inventing a logo', () => {
    updatePrivatePracticeBranding('user-local', {
      practice_name: 'Quiet Room Practice',
      practice_logo_url: '',
      practice_address_line1: '12 Studio Lane',
      practice_address_line2: '',
      practice_address_line3: 'Bristol',
      practice_postcode: 'BS1 1AA',
      practice_country: 'United Kingdom',
    })
    const profile = getProfile('user-local')
    const branding = resolvePracticeBranding(profile)
    expect(branding.name).toBe('Quiet Room Practice')
    expect(branding.logo_url).toBe('')
    expect(branding.address_line1).toBe('12 Studio Lane')
  })
})
