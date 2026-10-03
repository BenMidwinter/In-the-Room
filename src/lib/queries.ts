import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  getClientsForUser,
  getOrganisationClients,
  getWorkplaceContextsForUser,
  getOrganisationWorkplaceContexts,
} from './store'
import { ROLES } from './permissions'
import { workplaceQueryKeys } from './workplaceQueries'
import { useAppSession } from './AppSessionContext'

/**
 * Server-state facade. The store is still synchronous today, so the query
 * functions resolve immediately — but routing everything through TanStack Query
 * gives us a single cache, automatic dedupe, and invalidation-based refresh
 * instead of manual re-fetch counters. When the store becomes a real async API,
 * only the query functions change; the hooks and their consumers do not.
 *
 * staleTime: Infinity because the in-memory store never goes stale on its own —
 * data only changes via mutations, which explicitly invalidate the relevant keys.
 */

export const queryKeys = {
  clients: ['clients'],
  clientList: (userId, workplaceId, demoRole) => ['clients', { userId, workplaceId, demoRole }],
  workplaceContexts: ['workplaceContexts'],
  workplaceContextList: (userId, demoRole) => ['workplaceContexts', { userId, demoRole }],
}

/** Caseload for the active user/workplace/role, sourced from the query cache. */
export function useClientsQuery({ userId, demoRole, activeWorkplaceId, myWorkplace }) {
  const needsWorkplaceContext = demoRole !== ROLES.SERVICE_LEAD
  return useQuery({
    queryKey: queryKeys.clientList(userId, activeWorkplaceId, demoRole),
    queryFn: () =>
      demoRole === ROLES.SERVICE_LEAD
        ? getOrganisationClients()
        : getClientsForUser(userId, myWorkplace),
    enabled: Boolean(userId) && (!needsWorkplaceContext || Boolean(myWorkplace)),
    placeholderData: keepPreviousData,
  })
}

/** Workplace contexts the current user can act within. */
export function useWorkplaceContextsQuery({ userId, demoRole }) {
  return useQuery({
    queryKey: queryKeys.workplaceContextList(userId, demoRole),
    queryFn: () =>
      demoRole === ROLES.SERVICE_LEAD
        ? getOrganisationWorkplaceContexts()
        : getWorkplaceContextsForUser(userId),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
}

/**
 * Legacy-compatible refresh triggers. These preserve the exact `refreshClients`
 * / `refreshMemberships` API the ~31 existing consumers already call, but map
 * them onto cache invalidation instead of imperative state recomputation.
 */
export function useStoreRefreshers() {
  const queryClient = useQueryClient()

  const refreshClients = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clients })
  }, [queryClient])

  const refreshMemberships = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workplaceContexts })
    queryClient.invalidateQueries({ queryKey: queryKeys.clients })
    queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.workplace })
  }, [queryClient])

  return { refreshClients, refreshMemberships }
}

/** Caseload for the signed-in app shell — reads session/workplace from context. */
export function useAppClients() {
  const { session, demoRole, activeWorkplaceId, myWorkplace } = useAppSession()
  const query = useClientsQuery({
    userId: session.user.id,
    demoRole,
    activeWorkplaceId,
    myWorkplace,
  })
  return {
    ...query,
    clients: query.data ?? [],
  }
}
