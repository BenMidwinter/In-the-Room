import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listReportsForEpisode, saveReportForUser } from './supabase/reportsRepo'
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
