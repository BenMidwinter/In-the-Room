import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  getProgressNotes,
  getProgressNotesFeed,
  getProgressNote,
  getProgressNoteByAppointment,
  saveProgressNote,
  signOffProgressNote,
  getAvailableProgressNoteTemplates,
} from './store'

export const progressNoteQueryKeys = {
  progressNotes: ['progressNotes'],
  client: (clientId) => ['progressNotes', 'client', clientId],
  feed: (clientId) => ['progressNotes', 'feed', clientId],
  detail: (noteId) => ['progressNotes', 'detail', noteId],
  byAppointment: (appointmentId) => ['progressNotes', 'byAppointment', appointmentId],
  templates: (workplaceId) => ['progressNotes', 'templates', workplaceId ?? 'none'],
}

export function useClientProgressNotesQuery(clientId) {
  return useQuery({
    queryKey: progressNoteQueryKeys.client(clientId),
    queryFn: () => getProgressNotes(clientId),
    enabled: Boolean(clientId),
    placeholderData: keepPreviousData,
  })
}

export function useProgressNotesFeedQuery(clientId) {
  return useQuery({
    queryKey: progressNoteQueryKeys.feed(clientId),
    queryFn: () => getProgressNotesFeed(clientId),
    enabled: Boolean(clientId),
    placeholderData: keepPreviousData,
  })
}

export function useProgressNoteQuery(noteId, { enabled = true } = {}) {
  return useQuery({
    queryKey: progressNoteQueryKeys.detail(noteId),
    queryFn: () => getProgressNote(noteId),
    enabled: enabled && Boolean(noteId),
    placeholderData: keepPreviousData,
  })
}

export function useProgressNoteByAppointmentQuery(appointmentId, { enabled = true } = {}) {
  return useQuery({
    queryKey: progressNoteQueryKeys.byAppointment(appointmentId),
    queryFn: () => getProgressNoteByAppointment(appointmentId),
    enabled: enabled && Boolean(appointmentId),
    placeholderData: keepPreviousData,
  })
}

export function useAvailableProgressNoteTemplatesQuery(workplaceId) {
  return useQuery({
    queryKey: progressNoteQueryKeys.templates(workplaceId),
    queryFn: () => getAvailableProgressNoteTemplates(workplaceId),
    enabled: Boolean(workplaceId),
    placeholderData: keepPreviousData,
  })
}

export function useSaveProgressNoteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ payload, userId }: { payload: Parameters<typeof saveProgressNote>[0]; userId: string }) =>
      saveProgressNote(payload, userId),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: progressNoteQueryKeys.progressNotes })
      queryClient.setQueryData(progressNoteQueryKeys.detail(String(saved.id)), saved)
      if (saved.client_id) {
        queryClient.invalidateQueries({ queryKey: progressNoteQueryKeys.client(String(saved.client_id)) })
        queryClient.invalidateQueries({ queryKey: progressNoteQueryKeys.feed(String(saved.client_id)) })
      }
      if (saved.appointment_id) {
        queryClient.setQueryData(progressNoteQueryKeys.byAppointment(String(saved.appointment_id)), saved)
      }
    },
  })
}

export function useSignOffProgressNoteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ payload, userId }: { payload: Parameters<typeof signOffProgressNote>[0]; userId: string }) =>
      signOffProgressNote(payload, userId),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: progressNoteQueryKeys.progressNotes })
      queryClient.setQueryData(progressNoteQueryKeys.detail(String(saved.id)), saved)
      if (saved.client_id) {
        queryClient.invalidateQueries({ queryKey: progressNoteQueryKeys.client(String(saved.client_id)) })
        queryClient.invalidateQueries({ queryKey: progressNoteQueryKeys.feed(String(saved.client_id)) })
      }
      if (saved.appointment_id) {
        queryClient.setQueryData(progressNoteQueryKeys.byAppointment(String(saved.appointment_id)), saved)
      }
    },
  })
}
