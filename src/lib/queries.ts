import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchClientsForUser } from './supabase/clientsRepo'
import { useAppSession } from './AppSessionContext'

/**
 * Server-state facade via TanStack Query.
 * Clients load from Supabase when configured; otherwise the in-memory store.
 */

export const queryKeys = {
  clients: ['clients'],
  clientList: (userId) => ['clients', { userId }],
}

/** Caseload for the signed-in clinician. */
export function useClientsQuery({ userId }) {
  return useQuery({
    queryKey: queryKeys.clientList(userId),
    queryFn: () => fetchClientsForUser(userId, null),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

/**
 * Refresh triggers. `refreshClients` / `refreshMemberships` stay as the names
 * existing pages already call; both invalidate the caseload cache.
 */
export function useStoreRefreshers() {
  const queryClient = useQueryClient()

  const refreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clients })
  }, [queryClient])

  const refreshMemberships = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clients })
  }, [queryClient])

  return { refreshClients, refreshMemberships }
}

/** Caseload for the signed-in app shell. */
export function useAppClients() {
  const { session } = useAppSession()
  const query = useClientsQuery({ userId: session.user.id })
  return {
    ...query,
    clients: query.data ?? [],
  }
}
