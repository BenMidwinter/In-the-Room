import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPrivateSubmission,
  deleteForm,
  duplicateForm,
  deleteMeasure,
  deleteSubmission,
  listEpisodeForms,
  listEpisodeOutcomes,
  listForms,
  listMeasures,
  recordMeasureScore,
  saveForm,
  saveMeasure,
} from './supabase/formsRepo'

export const formQueryKeys = {
  measures: (userId: string) => ['measures', userId] as const,
  forms: (userId: string) => ['forms', userId] as const,
  episodeForms: (episodeId: string) => ['episode-forms', episodeId] as const,
  episodeOutcomes: (episodeId: string) => ['episode-outcomes', episodeId] as const,
}

const fresh = { staleTime: 0, refetchOnWindowFocus: true as const }

export function useMeasuresQuery(userId: string) {
  return useQuery({
    queryKey: formQueryKeys.measures(userId),
    queryFn: () => listMeasures(),
    enabled: Boolean(userId),
    ...fresh,
  })
}

export function useFormsQuery(userId: string) {
  return useQuery({
    queryKey: formQueryKeys.forms(userId),
    queryFn: () => listForms(),
    enabled: Boolean(userId),
    ...fresh,
  })
}

export function useEpisodeFormsQuery(episodeId: string, enabled: boolean) {
  return useQuery({
    queryKey: formQueryKeys.episodeForms(episodeId),
    queryFn: () => listEpisodeForms(episodeId),
    enabled: Boolean(episodeId) && enabled,
    ...fresh,
  })
}

export function useEpisodeOutcomesQuery(episodeId: string, enabled: boolean) {
  return useQuery({
    queryKey: formQueryKeys.episodeOutcomes(episodeId),
    queryFn: () => listEpisodeOutcomes(episodeId),
    enabled: Boolean(episodeId) && enabled,
    ...fresh,
  })
}

export function useSaveMeasureMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveMeasure,
    onSuccess: (saved) => {
      queryClient.setQueryData(formQueryKeys.measures(userId), (current) => {
        const list = Array.isArray(current) ? current : []
        return [...list.filter((row) => row.id !== saved.id), saved]
          .sort((a, b) => a.name.localeCompare(b.name))
      })
      queryClient.invalidateQueries({ queryKey: formQueryKeys.measures(userId) })
    },
  })
}

export function useDeleteMeasureMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMeasure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKeys.measures(userId) })
    },
  })
}

export function useSaveFormMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveForm,
    onSuccess: (saved) => {
      queryClient.setQueryData(formQueryKeys.forms(userId), (current) => {
        const list = Array.isArray(current) ? current : []
        return [...list.filter((row) => row.id !== saved.id), saved]
          .sort((a, b) => a.name.localeCompare(b.name))
      })
      queryClient.invalidateQueries({ queryKey: formQueryKeys.forms(userId) })
    },
  })
}

export function useDuplicateFormMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: duplicateForm,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKeys.forms(userId) })
    },
  })
}

export function useDeleteFormMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteForm,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKeys.forms(userId) })
    },
  })
}

export function useDeleteSubmissionMutation(episodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteSubmission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKeys.episodeForms(episodeId) })
    },
  })
}

export function useSendFormMutation(episodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPrivateSubmission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['episode-forms'] })
      if (episodeId) {
        queryClient.invalidateQueries({ queryKey: formQueryKeys.episodeForms(episodeId) })
      }
    },
  })
}

export function useRecordScoreMutation(episodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: recordMeasureScore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formQueryKeys.episodeOutcomes(episodeId) })
    },
  })
}
