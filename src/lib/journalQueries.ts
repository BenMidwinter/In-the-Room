import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteJournalEntryForUser,
  listJournalEntries,
  saveJournalEntryForUser,
} from './supabase/journalRepo'

export const journalQueryKeys = {
  author: (userId: string) => ['journal-entries', userId] as const,
}

export function useJournalEntriesQuery(userId: string) {
  return useQuery({
    queryKey: journalQueryKeys.author(userId),
    queryFn: () => listJournalEntries(userId),
    enabled: Boolean(userId),
  })
}

export function useSaveJournalEntryMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id?: string
      date: string
      time?: string
      somatic_state?: string
      body_text?: string
    }) => saveJournalEntryForUser(userId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: journalQueryKeys.author(userId) })
    },
  })
}

export function useDeleteJournalEntryMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => deleteJournalEntryForUser(userId, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: journalQueryKeys.author(userId) })
    },
  })
}
