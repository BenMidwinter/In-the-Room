import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteReport,
  listReportsForEpisode,
  saveReportForUser,
  setReportArchived,
  setReportStatus,
} from './supabase/reportsRepo'
import type { AppReport } from './store/reports'

export const reportQueryKeys = {
  reports: ['reports'],
  episode: (episodeId: string) => ['reports', 'episode', episodeId],
}

export function useEpisodeReportsQuery(episodeId: string | undefined) {
  return useQuery({
    queryKey: reportQueryKeys.episode(episodeId || ''),
    queryFn: () => listReportsForEpisode(String(episodeId)),
    enabled: Boolean(episodeId),
  })
}

export function useSaveReportMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveReportForUser,
    onSuccess: (saved: AppReport) => {
      if (saved.episode_id) {
        queryClient.invalidateQueries({ queryKey: reportQueryKeys.episode(saved.episode_id) })
      }
      if (saved.client_id) {
        queryClient.invalidateQueries({ queryKey: ['client-activity', saved.client_id] })
      }
    },
  })
}

export function useDeleteReportMutation(episodeId: string, clientId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.episode(episodeId) })
      if (clientId) queryClient.invalidateQueries({ queryKey: ['client-activity', clientId] })
    },
  })
}

export function useArchiveReportMutation(episodeId: string, clientId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setReportArchived(id, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.episode(episodeId) })
      if (clientId) queryClient.invalidateQueries({ queryKey: ['client-activity', clientId] })
    },
  })
}

export function useSetReportStatusMutation(episodeId: string, clientId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'archive' | 'trash' }) => setReportStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.episode(episodeId) })
      if (clientId) queryClient.invalidateQueries({ queryKey: ['client-activity', clientId] })
    },
  })
}
