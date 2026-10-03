import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, getWorkplaceRecord, updateWorkplaceBranding, updatePrivatePracticeBranding, getProfile } from './store'
import {
  CHROMATIK_DEFAULT_LOGO_URL,
  DEFAULT_WORKPLACE_BRANDING,
  formatWorkplaceAddress,
  getClinicalExportBranding,
  getWorkplaceBranding,
  resolvePracticeBranding,
  resolveWorkplaceBranding,
} from './workplaceBranding'

describe('workplaceBranding', () => {
  beforeEach(() => {
    resetStore()
  })

  it('defaults to ChromatiK logo when workplace has no logo_url', () => {
    const branding = getWorkplaceBranding('wp-chroma')
    expect(branding.logo_url).toBe(CHROMATIK_DEFAULT_LOGO_URL)
    expect(branding.name).toBe('Chroma Main HQ')
    expect(branding.address_line1).toBe('Chroma Main HQ')
    expect(branding.postcode).toBe('SE1 4AA')
  })

  it('uses distinct addresses per workplace', () => {
    const east = getWorkplaceBranding('wp-east')
    expect(east.address_line2).toBe('18 Riverside Studios')
    expect(east.postcode).toBe('E15 2GW')
  })

  it('falls back to ChromatiK branding for private clients', () => {
    const branding = getWorkplaceBranding(null)
    expect(branding.logo_url).toBe(CHROMATIK_DEFAULT_LOGO_URL)
    expect(branding.address_line1).toBe('ChromatiK')
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
    expect(line).not.toContain(DEFAULT_WORKPLACE_BRANDING.address_line2)
  })

  it('lets clinical leads update workplace branding for exports', () => {
    const myWorkplace = { id: 'wp-chroma', name: 'Chroma Main HQ', role: 'clinical_lead' }
    expect(getWorkplaceRecord('wp-chroma', myWorkplace)?.name).toBe('Chroma Main HQ')

    updateWorkplaceBranding('wp-chroma', {
      logo_url: 'https://example.com/logo.png',
      address_line1: 'North Wing',
      address_line2: '9 Market Street',
      address_line3: 'Manchester',
      postcode: 'M1 1AA',
      country: 'United Kingdom',
    }, 'user-ben', myWorkplace)

    const branding = getWorkplaceBranding('wp-chroma')
    expect(branding.logo_url).toBe('https://example.com/logo.png')
    expect(branding.address_line2).toBe('9 Market Street')
    expect(branding.postcode).toBe('M1 1AA')
  })

  it('rejects branding updates from clinicians', () => {
    const myWorkplace = { id: 'wp-chroma', name: 'Chroma Main HQ', role: 'clinician' }
    expect(getWorkplaceRecord('wp-chroma', myWorkplace)).toBeNull()
    expect(() => updateWorkplaceBranding('wp-chroma', {
      address_line1: 'Blocked',
    }, 'user-sarah', myWorkplace)).toThrow(/clinical lead/)
  })

  it('uses private practice branding for clients without a workplace', () => {
    updatePrivatePracticeBranding('user-sarah', {
      practice_name: 'Sarah Rivera Music Therapy',
      practice_address_line1: 'Studio 4, Market Lane',
      practice_address_line2: 'Brighton',
      practice_postcode: 'BN1 1AA',
      practice_country: 'United Kingdom',
    })

    const branding = getClinicalExportBranding(null, 'user-sarah')
    expect(branding.name).toBe('Sarah Rivera Music Therapy')
    expect(branding.address_line1).toBe('Studio 4, Market Lane')
    expect(branding.postcode).toBe('BN1 1AA')
  })

  it('prefers workplace branding when a workplace is linked', () => {
    const workplaceBranding = getClinicalExportBranding('wp-east', 'user-sarah')
    expect(workplaceBranding.name).toBe('Chroma East Hub')
    expect(workplaceBranding.address_line2).toBe('18 Riverside Studios')
  })

  it('defaults private practice name to clinician full name', () => {
    const profile = getProfile('user-sarah')
    const branding = resolvePracticeBranding(profile)
    expect(branding.name).toBe(profile.full_name)
  })
})
