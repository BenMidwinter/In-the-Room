import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  type TemplateKind,
} from './supabase/templatesRepo'

export const templateQueryKeys = {
  kind: (kind: TemplateKind) => ['templates', kind],
}

export function useTemplatesQuery(kind: TemplateKind) {
  return useQuery({
    queryKey: templateQueryKeys.kind(kind),
    queryFn: () => listTemplates(kind),
  })
}

export function useSaveTemplateMutation(kind: TemplateKind) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateQueryKeys.kind(kind) })
    },
  })
}

export function useDeleteTemplateMutation(kind: TemplateKind) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateQueryKeys.kind(kind) })
    },
  })
}
