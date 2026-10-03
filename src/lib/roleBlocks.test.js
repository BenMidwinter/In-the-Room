import { describe, expect, it } from 'vitest'
import { getVisibleHomeBlocks, getVisibleWorkplaceBlocks } from './roleBlocks'
import { ROLES } from './permissions'

describe('role block visibility', () => {
  it('shows clinician block only for clinicians on home and workplace', () => {
    expect(getVisibleHomeBlocks(ROLES.CLINICIAN)).toEqual(['clinician'])
    expect(getVisibleWorkplaceBlocks(ROLES.CLINICIAN)).toEqual(['clinician'])
  })

  it('shows administrator and finance blocks for administrators on home', () => {
    expect(getVisibleHomeBlocks(ROLES.ADMINISTRATOR)).toEqual(['administrator', 'admin_finance'])
  })

  it('shows management block for administrators and clinical leads at workplace', () => {
    expect(getVisibleWorkplaceBlocks(ROLES.ADMINISTRATOR)).toEqual(['administrator'])
    expect(getVisibleWorkplaceBlocks(ROLES.CLINICAL_LEAD)).toEqual(['administrator'])
  })

  it('shows clinician, ops, finance, and oversight home blocks for clinical leads', () => {
    expect(getVisibleHomeBlocks(ROLES.CLINICAL_LEAD)).toEqual([
      'clinician',
      'administrator',
      'admin_finance',
      'clinical_lead',
    ])
  })
})
