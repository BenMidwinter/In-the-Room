import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LogKind, PracticeLogInput } from './practiceLogs'
import { deletePracticeLog, listPracticeLogs, savePracticeLog, setPracticeLogArchived, setPracticeLogStatus } from './supabase/practiceLogsRepo'

export const practiceLogQueryKeys = {
  kind: (kind: LogKind, userId: string) => ['practice-log', kind, userId] as const,
}

export function usePracticeLogsQuery(kind: LogKind, userId: string) {
  return useQuery({
    queryKey: practiceLogQueryKeys.kind(kind, userId),
    queryFn: () => listPracticeLogs(kind, userId),
    enabled: Boolean(userId),
  })
}

export function useSavePracticeLogMutation(kind: LogKind, userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PracticeLogInput) => savePracticeLog(kind, userId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceLogQueryKeys.kind(kind, userId) })
    },
  })
}

export function useDeletePracticeLogMutation(kind: LogKind, userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePracticeLog(kind, userId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceLogQueryKeys.kind(kind, userId) })
    },
  })
}

export function useArchivePracticeLogMutation(kind: LogKind, userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setPracticeLogArchived(kind, userId, id, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceLogQueryKeys.kind(kind, userId) })
    },
  })
}

export function useSetPracticeLogStatusMutation(kind: LogKind, userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'archive' | 'trash' }) => setPracticeLogStatus(kind, userId, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceLogQueryKeys.kind(kind, userId) })
    },
  })
}
