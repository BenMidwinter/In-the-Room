import { buildPermissions, ROLES } from './permissions'
import { useAppSession } from './AppSessionContext'

/** Permissions for the current user, optional client, and demo role override. */
export function usePermissions(client = null) {
  const { session, myWorkplace, demoRole } = useAppSession()
  const base = buildPermissions(myWorkplace, client, session?.user?.id, demoRole)
  return {
    ...base,
    blurClientIdentity: demoRole === ROLES.SERVICE_LEAD,
    isServiceLeadView: demoRole === ROLES.SERVICE_LEAD,
  }
}
