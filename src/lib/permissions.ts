/**
 * Role-based access control — mirrors intended Supabase RLS behaviour.
 *
 * Roles (per workplace membership):
 * - clinical_lead: full workplace caseload + all clinical & admin actions
 * - administrator: full workplace caseload, no progress notes, workplace admin
 * - clinician: assigned clients only (+ full control of private practice clients)
 *
 * A user may hold different roles at different workplaces; membership.role
 * applies per workplace. The demo role toggle overrides the active workplace role.
 */

export const ROLES = {
  CLINICAL_LEAD: 'clinical_lead',
  ADMINISTRATOR: 'administrator',
  CLINICIAN: 'clinician',
  /** Demo preview — organisation admin, not a workplace membership role. */
  SERVICE_LEAD: 'service_lead',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export interface WorkplaceContext {
  id?: string
  role?: string
  effectiveRole?: string
}

export interface Client {
  id?: string
  workplace_id?: string | null
  user_id?: string
}

export interface DemoUser {
  isServiceLead?: boolean
  isAdmin?: boolean
}

interface Capability {
  label: string
  summary: string
  can: string[]
  cannot: string[]
}

export const DEMO_ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: ROLES.CLINICAL_LEAD, label: 'Clinical lead' },
  { value: ROLES.ADMINISTRATOR, label: 'Administrator' },
  { value: ROLES.CLINICIAN, label: 'Clinician' },
  { value: ROLES.SERVICE_LEAD, label: 'Service Lead' },
]

/** Human-readable capability matrix for the demo banner. */
export const ROLE_CAPABILITIES: Record<Role, Capability> = {
  [ROLES.CLINICAL_LEAD]: {
    label: 'Clinical lead',
    summary: 'Full workplace caseload. All clinical work plus workplace administration.',
    can: [
      'See all clients at this workplace',
      'Full control of your private practice clients',
      'Progress notes, appointments, forms & files',
      'Start new cases (episodes)',
      'Workplace admin — team, data export, add clinicians',
    ],
    cannot: [],
  },
  [ROLES.ADMINISTRATOR]: {
    label: 'Administrator',
    summary: 'Full workplace visibility and operations — without clinical note-writing.',
    can: [
      'See all clients at this workplace',
      'Start new cases, forms, files & records',
      'Schedule appointments on clinician calendars',
      'Workplace admin — team, data export, add clinicians',
    ],
    cannot: [
      'Write progress notes',
      'Body map clinical tools',
      'Add new client records (start cases on existing clients instead)',
    ],
  },
  [ROLES.CLINICIAN]: {
    label: 'Clinician',
    summary: 'Assigned clients only at this workplace; full access within those records.',
    can: [
      'See clients assigned to you (workplace & private)',
      'Progress notes, appointments, forms & files for your clients',
      'Add private practice clients',
      'Add new workplace client records',
    ],
    cannot: [
      "See other clinicians' workplace clients",
      'Start new workplace cases',
      'Workplace admin or data export',
    ],
  },
  [ROLES.SERVICE_LEAD]: {
    label: 'Service Lead',
    summary: 'Organisation-wide administration — workplaces, templates, and outcome forms.',
    can: [
      'Add and manage workplaces across the organisation',
      'Create and edit progress note templates',
      'Create and edit letter templates',
      'Configure organisation-wide outcome forms',
    ],
    cannot: ['Day-to-day clinical casework (use a workplace role view instead)'],
  },
}

const LEGACY_ROLE_MAP: Record<string, Role> = {
  workplace_manager: ROLES.CLINICAL_LEAD,
  archivist: ROLES.ADMINISTRATOR,
  manager: ROLES.CLINICAL_LEAD,
  admin: ROLES.ADMINISTRATOR,
}

export function normalizeRole(role?: string | null): string {
  if (!role) return ROLES.CLINICIAN
  return LEGACY_ROLE_MAP[role] || role
}

export function getEffectiveRole(workplaceContext?: WorkplaceContext | null): string {
  if (!workplaceContext) return ROLES.CLINICIAN
  return normalizeRole(workplaceContext.effectiveRole ?? workplaceContext.role)
}

export function canViewFullWorkplaceCaseload(workplaceContext?: WorkplaceContext | null): boolean {
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.CLINICAL_LEAD || role === ROLES.ADMINISTRATOR
}

export function canManageWorkplace(workplaceContext?: WorkplaceContext | null): boolean {
  return canViewFullWorkplaceCaseload(workplaceContext)
}

/** Clinical leads and administrators manage team membership at a workplace. */
export function canManageTeamMembership(workplaceContext?: WorkplaceContext | null): boolean {
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.CLINICAL_LEAD || role === ROLES.ADMINISTRATOR
}

export function canViewTeamCaseloadCounts(workplaceContext?: WorkplaceContext | null): boolean {
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.CLINICAL_LEAD || role === ROLES.ADMINISTRATOR
}

export function isWorkplaceManager(workplaceContext?: WorkplaceContext | null): boolean {
  return canManageWorkplace(workplaceContext)
}

export function canAccessClient(
  client?: Client | null,
  userId?: string,
  workplaceContext?: WorkplaceContext | null,
): boolean {
  if (!client) return false

  if (!client.workplace_id) {
    return client.user_id === userId
  }

  if (!workplaceContext || workplaceContext.id !== client.workplace_id) {
    return client.user_id === userId
  }

  if (canViewFullWorkplaceCaseload(workplaceContext)) {
    return true
  }

  return client.user_id === userId
}

export function filterClientsForUser<T extends Client>(
  clients: T[],
  userId?: string,
  workplaceContext?: WorkplaceContext | null,
): T[] {
  return clients.filter((c) => canAccessClient(c, userId, workplaceContext))
}

export function canWriteProgressNotes(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
): boolean {
  if (!canAccessClient(client, userId, workplaceContext)) return false
  const role = getEffectiveRole(workplaceContext)
  if (role === ROLES.ADMINISTRATOR) return false
  return role === ROLES.CLINICAL_LEAD || role === ROLES.CLINICIAN
}

export function canManageRecords(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
): boolean {
  return canAccessClient(client, userId, workplaceContext)
}

export function canAssignAppointmentClinician(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
): boolean {
  if (!client?.workplace_id) return false
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.ADMINISTRATOR || role === ROLES.CLINICAL_LEAD
}

export function canManageAppointments(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
): boolean {
  return canAccessClient(client, userId, workplaceContext)
}

export function canStartNewCase(workplaceContext?: WorkplaceContext | null): boolean {
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.CLINICAL_LEAD || role === ROLES.ADMINISTRATOR
}

export function canAddWorkplaceClient(workplaceContext?: WorkplaceContext | null): boolean {
  return getEffectiveRole(workplaceContext) === ROLES.CLINICAL_LEAD
}

export function canAddPrivateClient(workplaceContext?: WorkplaceContext | null): boolean {
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.CLINICAL_LEAD || role === ROLES.CLINICIAN
}

export function canEditClientDetails(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
): boolean {
  if (!canAccessClient(client, userId, workplaceContext)) return false
  const role = getEffectiveRole(workplaceContext)
  if (role === ROLES.ADMINISTRATOR || role === ROLES.CLINICAL_LEAD) {
    return !!client?.workplace_id
  }
  return client?.user_id === userId
}

export function canUseBodyMap(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
): boolean {
  if (!canAccessClient(client, userId, workplaceContext)) return false
  const role = getEffectiveRole(workplaceContext)
  return role === ROLES.CLINICAL_LEAD || role === ROLES.CLINICIAN
}

export function canAccessClientNavSection(
  section: string,
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
): boolean {
  switch (section) {
    case 'progress-notes':
      return canWriteProgressNotes(workplaceContext, client, userId)
    case 'appointments':
      return canManageAppointments(workplaceContext, client, userId)
    case 'case-history':
      return canManageRecords(workplaceContext, client, userId)
    case 'notes-history':
      return (
        canWriteProgressNotes(workplaceContext, client, userId) ||
        canManageRecords(workplaceContext, client, userId)
      )
    case 'letters':
    case 'documents':
    case 'files':
    case 'forms':
    case 'contacts':
    case 'outcomes':
      return canManageRecords(workplaceContext, client, userId)
    default:
      return canAccessClient(client, userId, workplaceContext)
  }
}

export function isServiceLead(user?: DemoUser | null): boolean {
  return !!(user?.isServiceLead || user?.isAdmin)
}

export function canAccessServiceLead(user?: DemoUser | null): boolean {
  return isServiceLead(user)
}

/** Demo preview or real service-lead user — controls Service Lead nav and routes. */
export function canAccessServiceLeadArea(demoRole?: string, user?: DemoUser | null): boolean {
  return demoRole === ROLES.SERVICE_LEAD || canAccessServiceLead(user)
}

/** Finance nav/page: administrators, clinical leads, and service leads only. */
/** Finance is available to freelance clinicians (and legacy admin roles). */
export function canAccessFinanceArea(demoRole?: string): boolean {
  const role = normalizeRole(demoRole)
  return (
    role === ROLES.CLINICIAN
    || role === ROLES.ADMINISTRATOR
    || role === ROLES.CLINICAL_LEAD
    || role === ROLES.SERVICE_LEAD
  )
}

/** Workplace RBAC role used when the demo picker is on Service Lead. */
export function workplaceRoleForDemo(demoRole?: string): string | undefined {
  return demoRole === ROLES.SERVICE_LEAD ? ROLES.CLINICAL_LEAD : demoRole
}

export function buildPermissions(
  workplaceContext?: WorkplaceContext | null,
  client?: Client | null,
  userId?: string,
  demoRole?: string,
) {
  const role = getEffectiveRole(workplaceContext)
  return {
    role,
    roleLabel: ROLE_CAPABILITIES[role as Role]?.label || role,
    canViewFullCaseload: canViewFullWorkplaceCaseload(workplaceContext),
    canManageWorkplace: canManageWorkplace(workplaceContext),
    canManageTeamMembership: canManageTeamMembership(workplaceContext),
    canViewTeamCaseloadCounts: canViewTeamCaseloadCounts(workplaceContext),
    canWriteProgressNotes: canWriteProgressNotes(workplaceContext, client, userId),
    canManageRecords: canManageRecords(workplaceContext, client, userId),
    canManageAppointments: canManageAppointments(workplaceContext, client, userId),
    canStartNewCase: canStartNewCase(workplaceContext),
    canAddWorkplaceClient: canAddWorkplaceClient(workplaceContext),
    canAddPrivateClient: canAddPrivateClient(workplaceContext),
    canEditClientDetails: canEditClientDetails(workplaceContext, client, userId),
    canUseBodyMap: canUseBodyMap(workplaceContext, client, userId),
    canAccessClient: client ? canAccessClient(client, userId, workplaceContext) : true,
    canAssignAppointmentClinician: canAssignAppointmentClinician(workplaceContext, client),
    canAccessFinanceArea: canAccessFinanceArea(demoRole || role),
  }
}
