import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dischargeEpisode, listEpisodesForClient, openEpisode } from './supabase/episodesRepo'
import { assignAppointmentsToEpisode } from './supabase/appointmentsRepo'
import type { AppEpisode } from './store/episodes'

export const episodeQueryKeys = {
  episodes: ['episodes'],
  client: (clientId: string) => ['episodes', 'client', clientId],
}

export function useClientEpisodesQuery(clientId: string | undefined) {
  return useQuery({
    queryKey: episodeQueryKeys.client(clientId || ''),
    queryFn: () => listEpisodesForClient(String(clientId)),
    enabled: Boolean(clientId),
  })
}

export function useOpenEpisodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      clientId: string
      ownerId: string
      organizationId?: string | null
    }) => openEpisode(input),
    onSuccess: (episode: AppEpisode) => {
      queryClient.invalidateQueries({ queryKey: episodeQueryKeys.client(episode.client_id) })
    },
  })
}

export function useAssignAppointmentsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { clientId: string; episodeId: string; appointmentIds: string[] }) =>
      assignAppointmentsToEpisode(input),
    onSuccess: (_moved, input) => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'client', input.clientId] })
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['progressNotes'] })
    },
  })
}

export function useDischargeEpisodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { episodeId: string; clientId: string }) => dischargeEpisode(input.episodeId),
    onSuccess: (_episode, input) => {
      queryClient.invalidateQueries({ queryKey: episodeQueryKeys.client(input.clientId) })
    },
  })
}
