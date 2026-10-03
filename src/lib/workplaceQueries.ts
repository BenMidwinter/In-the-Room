import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  getWorkplaceMembers,
  getTeamMemberProfile,
  getMembershipRequestsForWorkplace,
  getAuditLogs,
  getMyMembershipRequests,
  getWorkplaceRecord,
  updateWorkplaceBranding,
  updateWorkplaceMemberRole,
  approveMembershipRequest,
  declineMembershipRequest,
  inviteClinicianToWorkplace,
  requestWorkplaceMembership,
} from './store'

export const workplaceQueryKeys = {
  workplace: ['workplace'],
  record: (workplaceId) => ['workplace', 'record', workplaceId],
  members: (workplaceId) => ['workplace', 'members', workplaceId],
  memberProfile: (workplaceId, userId) => ['workplace', 'member', workplaceId, userId],
  joinRequests: (workplaceId, status = 'pending') => ['workplace', 'joinRequests', workplaceId, status],
  auditLogs: (workplaceId) => ['workplace', 'auditLogs', workplaceId],
  myMembershipRequests: (userId) => ['workplace', 'myRequests', userId],
}

export function useWorkplaceMembersQuery(workplaceId, myWorkplace) {
  return useQuery({
    queryKey: workplaceQueryKeys.members(workplaceId),
    queryFn: () => getWorkplaceMembers(workplaceId, myWorkplace),
    enabled: Boolean(workplaceId && myWorkplace),
    placeholderData: keepPreviousData,
  })
}

export function useWorkplaceRecordQuery(workplaceId, myWorkplace) {
  return useQuery({
    queryKey: workplaceQueryKeys.record(workplaceId),
    queryFn: () => getWorkplaceRecord(workplaceId, myWorkplace),
    enabled: Boolean(workplaceId && myWorkplace),
    placeholderData: keepPreviousData,
  })
}

export function useTeamMemberProfileQuery(userId, workplaceId, myWorkplace) {
  return useQuery({
    queryKey: workplaceQueryKeys.memberProfile(workplaceId, userId),
    queryFn: () => getTeamMemberProfile(userId, workplaceId, myWorkplace),
    enabled: Boolean(userId && workplaceId && myWorkplace),
    placeholderData: keepPreviousData,
  })
}

export function useMembershipRequestsQuery(workplaceId, status = 'pending') {
  return useQuery({
    queryKey: workplaceQueryKeys.joinRequests(workplaceId, status),
    queryFn: () => getMembershipRequestsForWorkplace(workplaceId, status),
    enabled: Boolean(workplaceId),
    placeholderData: keepPreviousData,
  })
}

export function useWorkplaceAuditLogsQuery(workplaceId, myWorkplace) {
  return useQuery({
    queryKey: workplaceQueryKeys.auditLogs(workplaceId),
    queryFn: () => getAuditLogs(workplaceId, myWorkplace),
    enabled: Boolean(workplaceId && myWorkplace),
    placeholderData: keepPreviousData,
  })
}

export function useMyMembershipRequestsQuery(userId) {
  return useQuery({
    queryKey: workplaceQueryKeys.myMembershipRequests(userId),
    queryFn: () => getMyMembershipRequests(userId),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
}

function invalidateWorkplaceDomain(queryClient, workplaceId) {
  queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.workplace })
  if (workplaceId) {
    queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.record(workplaceId) })
    queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.members(workplaceId) })
    queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.joinRequests(workplaceId) })
    queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.auditLogs(workplaceId) })
  }
}

export function useUpdateWorkplaceMemberRoleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      workplaceId: string
      memberUserId: string
      newRole: string
      actorId: string
      myWorkplace: unknown
    }) => updateWorkplaceMemberRole(vars.workplaceId, vars.memberUserId, vars.newRole, vars.actorId, vars.myWorkplace),
    onSuccess: (_result, { workplaceId, memberUserId }) => {
      invalidateWorkplaceDomain(queryClient, workplaceId)
      queryClient.invalidateQueries({
        queryKey: workplaceQueryKeys.memberProfile(workplaceId, memberUserId),
      })
    },
  })
}

export function useApproveMembershipRequestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      requestId: string
      actorId: string
      myWorkplace: { id?: string }
      role?: string
    }) => approveMembershipRequest(vars.requestId, vars.actorId, vars.myWorkplace, vars.role),
    onSuccess: (_result, { myWorkplace }) => {
      invalidateWorkplaceDomain(queryClient, myWorkplace?.id)
    },
  })
}

export function useDeclineMembershipRequestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { requestId: string; actorId: string; myWorkplace: { id?: string } }) =>
      declineMembershipRequest(vars.requestId, vars.actorId, vars.myWorkplace),
    onSuccess: (_result, { myWorkplace }) => {
      invalidateWorkplaceDomain(queryClient, myWorkplace?.id)
    },
  })
}

export function useInviteClinicianToWorkplaceMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      workplaceId: string
      userId: string
      actorId: string
      myWorkplace: unknown
      role?: string
    }) => inviteClinicianToWorkplace(vars.workplaceId, vars.userId, vars.actorId, vars.myWorkplace, vars.role),
    onSuccess: (_result, { workplaceId }) => {
      invalidateWorkplaceDomain(queryClient, workplaceId)
    },
  })
}

export function useRequestWorkplaceMembershipMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; workplaceId: string; message?: string }) =>
      requestWorkplaceMembership(vars.userId, vars.workplaceId, vars.message),
    onSuccess: (_result, { userId }) => {
      queryClient.invalidateQueries({ queryKey: workplaceQueryKeys.myMembershipRequests(userId) })
    },
  })
}

export function useUpdateWorkplaceBrandingMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      workplaceId: string
      payload: Record<string, unknown>
      actorId: string
      myWorkplace: unknown
    }) => updateWorkplaceBranding(vars.workplaceId, vars.payload, vars.actorId, vars.myWorkplace),
    onSuccess: (_result, { workplaceId }) => {
      invalidateWorkplaceDomain(queryClient, workplaceId)
    },
  })
}
