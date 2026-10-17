import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPracticeItem,
  deletePracticeItem,
  listPracticeItems,
  renamePracticeItem,
  savePracticeDocument,
  setPracticeItemArchived,
  setPracticeItemStatus,
} from './supabase/practiceItemsRepo'

export const practiceQueryKeys = {
  all: ['practice-items'] as const,
}

export function usePracticeItemsQuery() {
  return useQuery({
    queryKey: practiceQueryKeys.all,
    queryFn: listPracticeItems,
  })
}

export function usePracticeItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (action: { type: 'create'; parentId?: string | null; kind: 'folder' | 'document'; name: string; content?: string }
      | { type: 'save'; id?: string | null; parentId?: string | null; name: string; content: string }
      | { type: 'rename'; id: string; name: string }
      | { type: 'delete'; id: string }
      | { type: 'archive'; id: string; archived: boolean }
      | { type: 'status'; id: string; status: 'active' | 'archive' | 'trash' }) => {
      if (action.type === 'create') {
        return createPracticeItem(action)
      }
      if (action.type === 'save') {
        return savePracticeDocument(action)
      }
      if (action.type === 'rename') {
        return renamePracticeItem(action.id, action.name)
      }
      if (action.type === 'archive') {
        return setPracticeItemArchived(action.id, action.archived)
      }
      if (action.type === 'status') {
        return setPracticeItemStatus(action.id, action.status)
      }
      await deletePracticeItem(action.id)
      return null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceQueryKeys.all })
    },
  })
}
