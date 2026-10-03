import { useParams, useOutletContext } from 'react-router-dom'
import { useAppSession } from './AppSessionContext'
import { useAppClients } from './queries'

/** Shared context for nested client sub-routes (notes, documents, letters, etc.). */
export function useClientSession() {
  const { id, clientId: clientIdParam } = useParams()
  const clientId = clientIdParam || id
  const outletCtx = useOutletContext<{ client?: { id: string; [key: string]: unknown } }>() || {}
  const { session, refreshClients } = useAppSession()
  const { clients } = useAppClients()
  const client = outletCtx.client ?? clients?.find(c => c.id === clientId) ?? null

  return {
    clientId,
    client,
    session,
    refreshClients,
  }
}
