import { describe, it, expect } from 'vitest'
import {
  ROLES,
  normalizeRole,
  getEffectiveRole,
  canViewFullWorkplaceCaseload,
  canManageTeamMembership,
  canAccessClient,
  filterClientsForUser,
  canWriteProgressNotes,
  canAddWorkplaceClient,
  canAddPrivateClient,
  canAssignAppointmentClinician,
  canAccessClientNavSection,
  workplaceRoleForDemo,
  buildPermissions,
  canAccessFinanceArea,
  canCloseSafeguardingConcern,
} from './permissions'

const leadCtx = { id: 'wp1', effectiveRole: ROLES.CLINICAL_LEAD }
const adminCtx = { id: 'wp1', role: ROLES.ADMINISTRATOR }
const clinicianCtx = { id: 'wp1', role: ROLES.CLINICIAN }

const privateClient = { id: 'c-priv', user_id: 'u1', workplace_id: null }
const wpClientOther = { id: 'c-wp', user_id: 'u2', workplace_id: 'wp1' }

describe('normalizeRole', () => {
  it('maps legacy roles', () => {
    expect(normalizeRole('manager')).toBe(ROLES.CLINICAL_LEAD)
    expect(normalizeRole('admin')).toBe(ROLES.ADMINISTRATOR)
    expect(normalizeRole('archivist')).toBe(ROLES.ADMINISTRATOR)
  })
  it('defaults to clinician when absent', () => {
    expect(normalizeRole(undefined)).toBe(ROLES.CLINICIAN)
    expect(normalizeRole(null)).toBe(ROLES.CLINICIAN)
  })
  it('passes through known roles', () => {
    expect(normalizeRole(ROLES.CLINICIAN)).toBe(ROLES.CLINICIAN)
  })
})

describe('getEffectiveRole', () => {
  it('prefers effectiveRole over role', () => {
    expect(getEffectiveRole({ role: ROLES.CLINICIAN, effectiveRole: ROLES.CLINICAL_LEAD })).toBe(ROLES.CLINICAL_LEAD)
  })
  it('falls back to clinician for no context', () => {
    expect(getEffectiveRole(null)).toBe(ROLES.CLINICIAN)
  })
})

describe('caseload visibility', () => {
  it('lead and admin see full caseload; clinician does not', () => {
    expect(canViewFullWorkplaceCaseload(leadCtx)).toBe(true)
    expect(canViewFullWorkplaceCaseload(adminCtx)).toBe(true)
    expect(canViewFullWorkplaceCaseload(clinicianCtx)).toBe(false)
  })
  it('clinical lead and administrator manage team membership', () => {
    expect(canManageTeamMembership(leadCtx)).toBe(true)
    expect(canManageTeamMembership(adminCtx)).toBe(true)
    expect(canManageTeamMembership(clinicianCtx)).toBe(false)
  })
})

describe('canAccessClient', () => {
  it('private client is accessible only by its owner', () => {
    expect(canAccessClient(privateClient, 'u1', null)).toBe(true)
    expect(canAccessClient(privateClient, 'u2', null)).toBe(false)
  })
  it('workplace lead sees a colleague\'s workplace client', () => {
    expect(canAccessClient(wpClientOther, 'u1', leadCtx)).toBe(true)
  })
  it('clinician only sees their own workplace clients', () => {
    expect(canAccessClient(wpClientOther, 'u1', clinicianCtx)).toBe(false)
    expect(canAccessClient(wpClientOther, 'u2', clinicianCtx)).toBe(true)
  })
  it('returns false for null client', () => {
    expect(canAccessClient(null, 'u1', leadCtx)).toBe(false)
  })
})

describe('filterClientsForUser', () => {
  it('keeps only accessible clients', () => {
    const clients = [privateClient, wpClientOther]
    expect(filterClientsForUser(clients, 'u1', clinicianCtx)).toEqual([privateClient])
    expect(filterClientsForUser(clients, 'u1', leadCtx)).toEqual([privateClient, wpClientOther])
  })
})

describe('clinical action gates', () => {
  it('administrators cannot write progress notes', () => {
    expect(canWriteProgressNotes(adminCtx, wpClientOther, 'u1')).toBe(false)
  })
  it('leads can write progress notes for accessible clients', () => {
    expect(canWriteProgressNotes(leadCtx, wpClientOther, 'u1')).toBe(true)
  })
  it('client add rules by role', () => {
    expect(canAddWorkplaceClient(leadCtx)).toBe(true)
    expect(canAddWorkplaceClient(clinicianCtx)).toBe(false)
    expect(canAddPrivateClient(clinicianCtx)).toBe(true)
    expect(canAddPrivateClient(adminCtx)).toBe(false)
  })
  it('clinical leads and administrators assign an appointment clinician for workplace clients', () => {
    expect(canAssignAppointmentClinician(adminCtx, wpClientOther)).toBe(true)
    expect(canAssignAppointmentClinician(leadCtx, wpClientOther)).toBe(true)
    expect(canAssignAppointmentClinician(adminCtx, privateClient)).toBe(false)
  })
})

describe('canAccessClientNavSection', () => {
  it('gates progress notes behind note-writing permission', () => {
    expect(canAccessClientNavSection('progress-notes', adminCtx, wpClientOther, 'u1')).toBe(false)
    expect(canAccessClientNavSection('progress-notes', leadCtx, wpClientOther, 'u1')).toBe(true)
  })
  it('lets accessible users open records sections', () => {
    expect(canAccessClientNavSection('letters', leadCtx, wpClientOther, 'u1')).toBe(true)
  })
})

describe('workplaceRoleForDemo', () => {
  it('maps service lead to clinical lead for workplace RBAC', () => {
    expect(workplaceRoleForDemo(ROLES.SERVICE_LEAD)).toBe(ROLES.CLINICAL_LEAD)
    expect(workplaceRoleForDemo(ROLES.CLINICIAN)).toBe(ROLES.CLINICIAN)
  })
})

describe('buildPermissions', () => {
  it('produces a coherent capability map for a lead', () => {
    const perms = buildPermissions(leadCtx, wpClientOther, 'u1')
    expect(perms.role).toBe(ROLES.CLINICAL_LEAD)
    expect(perms.canViewFullCaseload).toBe(true)
    expect(perms.canManageWorkplace).toBe(true)
    expect(perms.canWriteProgressNotes).toBe(true)
    expect(perms.canAccessClient).toBe(true)
  })
  it('reflects administrator restrictions', () => {
    const perms = buildPermissions(adminCtx, wpClientOther, 'u1')
    expect(perms.canWriteProgressNotes).toBe(false)
    expect(perms.canViewFullCaseload).toBe(true)
  })
})

describe('finance and safeguarding permissions', () => {
  it('limits finance to admin, clinical lead, and service lead', () => {
    expect(canAccessFinanceArea(ROLES.ADMINISTRATOR)).toBe(true)
    expect(canAccessFinanceArea(ROLES.CLINICAL_LEAD)).toBe(true)
    expect(canAccessFinanceArea(ROLES.SERVICE_LEAD)).toBe(true)
    expect(canAccessFinanceArea(ROLES.CLINICIAN)).toBe(false)
  })

  it('only clinical lead or service lead can close safeguarding', () => {
    expect(canCloseSafeguardingConcern(leadCtx)).toBe(true)
    expect(canCloseSafeguardingConcern(adminCtx)).toBe(false)
    expect(canCloseSafeguardingConcern(clinicianCtx)).toBe(false)
    expect(canCloseSafeguardingConcern(clinicianCtx, ROLES.SERVICE_LEAD)).toBe(true)
  })
})
