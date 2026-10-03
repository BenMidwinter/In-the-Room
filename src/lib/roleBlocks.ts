import { ROLES, normalizeRole } from './permissions'

/** Home stacked blocks — top to bottom. */
export const ROLE_BLOCK_ORDER = ['clinician', 'administrator', 'admin_finance', 'clinical_lead']

export const ROLE_BLOCK_META = {
  clinician: {
    id: 'clinician',
    label: 'Clinician',
    title: 'Your practice',
    description: 'Your upcoming sessions and active cases.',
  },
  administrator: {
    id: 'administrator',
    label: 'Administrator',
    title: 'Team operations',
    description: 'Workplace-wide sessions, cases, and attendance.',
  },
  admin_finance: {
    id: 'admin_finance',
    label: 'Administrator',
    title: 'Timesheets, expenses & invoicing',
    description: 'Payroll hours, expense claims, and invoice drafts — Xero sync coming later.',
  },
  clinical_lead: {
    id: 'clinical_lead',
    label: 'Clinical Lead',
    title: 'Clinical oversight',
    description: 'Documentation compliance, outcomes, and caseload quality.',
  },
  workplace_information: {
    id: 'workplace_information',
    label: 'Workplace',
    title: 'Workplace information',
    description: 'Letterhead and address on progress note and letter downloads for this site.',
  },
}

/** Profile hub blocks — clinician settings. */
export const PROFILE_BLOCK_META = {
  profile_identity: {
    id: 'profile_identity',
    label: 'Profile',
    title: 'Clinician identity',
    description: 'Your professional details, biography, and note signature.',
  },
  profile_workplace: {
    id: 'profile_workplace',
    label: 'Workplace',
    title: 'Workplace membership',
    description: 'Where you practise and your role on the team.',
  },
  profile_availability: {
    id: 'profile_availability',
    label: 'Availability',
    title: 'Availability & services',
    description: 'Working hours and clinical services offered at each location.',
  },
  profile_letterhead: {
    id: 'profile_letterhead',
    label: 'Exports',
    title: 'Private practice letterhead',
    description: 'Logo and address on downloads for your private clients.',
  },
  profile_journal: {
    id: 'profile_journal',
    label: 'Reflective',
    title: 'Clinician journal',
    description: 'Private reflective space — not visible to your workplace.',
  },
}

/**
 * Home: clinicians see personal block only; administrators see team ops + finance;
 * clinical leads see personal, team ops, finance, and oversight.
 */
export function getVisibleHomeBlocks(personaRole) {
  const role = normalizeRole(personaRole)
  if (role === ROLES.CLINICAL_LEAD) return [...ROLE_BLOCK_ORDER]
  if (role === ROLES.ADMINISTRATOR) return ['administrator', 'admin_finance']
  return ['clinician']
}

/**
 * Workplace: clinicians get a read-only team roster (+ join other sites).
 * Administrators and clinical leads share the management block.
 */
export function getVisibleWorkplaceBlocks(effectiveRole) {
  const role = normalizeRole(effectiveRole)
  if (role === ROLES.CLINICIAN) return ['clinician']
  return ['administrator']
}

export const WORKPLACE_MEMBERSHIP_ROLES = [
  { value: ROLES.CLINICIAN, label: 'Clinician' },
  { value: ROLES.ADMINISTRATOR, label: 'Administrator' },
  { value: ROLES.CLINICAL_LEAD, label: 'Clinical Lead' },
]
