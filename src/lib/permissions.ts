/**
 * Owner access for a single freelance practice.
 * Caseload visibility is the signed-in clinician's own records.
 */

export interface Client {
  id?: string
  workplace_id?: string | null
  user_id?: string
}

export function canAccessClient(client?: Client | null, userId?: string): boolean {
  if (!client || !userId) return false
  if (!client.user_id) return true
  return client.user_id === userId
}

export function filterClientsForUser<T extends Client>(
  clients: T[],
  userId?: string,
  _workplace?: unknown,
): T[] {
  return clients.filter((client) => canAccessClient(client, userId))
}

export function canAccessClientNavSection(
  _section: string,
  _workplace?: unknown,
  client?: Client | null,
  userId?: string,
): boolean {
  if (!client) return true
  return canAccessClient(client, userId)
}

/** Freelance practice has one diary — no team assignment picker. */
export function canAssignAppointmentClinician(): boolean {
  return false
}

export function buildPermissions(
  _workplace?: unknown,
  client?: Client | null,
  userId?: string,
) {
  const owns = client ? canAccessClient(client, userId) : true
  return {
    canWriteProgressNotes: owns,
    canManageRecords: owns,
    canManageAppointments: owns,
    canStartNewCase: owns,
    canAddWorkplaceClient: false,
    canAddPrivateClient: true,
    canEditClientDetails: owns,
    canAccessClient: owns,
    canAssignAppointmentClinician: false,
    canViewFullCaseload: false,
  }
}
