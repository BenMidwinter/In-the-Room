import { buildPermissions } from './permissions'
import { useAppSession } from './AppSessionContext'

/** Access flags for the signed-in clinician, optionally scoped to one client. */
export function usePermissions(client = null) {
  const { session } = useAppSession()
  return buildPermissions(null, client, session?.user?.id)
}
