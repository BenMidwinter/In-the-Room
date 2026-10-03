import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addClinicianUser,
  addOrgService,
  addWorkplace,
  getAllClinicianProfiles,
  getAllOrgServices,
  getAllWorkplaces,
  getLetterTemplate,
  getLetterTemplates,
  getProgressNoteTemplate,
  getProgressNoteTemplates,
  saveLetterTemplate,
  saveProgressNoteTemplate,
} from './store'
import { buildServiceLeadOverview } from './serviceLeadBlocks'

export const orgQueryKeys = {
  org: ['org'],
  workplaces: ['org', 'workplaces'],
  users: ['org', 'users'],
  services: ['org', 'services'],
  progressNoteTemplates: ['org', 'progressNoteTemplates'],
  letterTemplates: ['org', 'letterTemplates'],
  progressNoteTemplate: (id) => ['org', 'progressNoteTemplates', id],
  letterTemplate: (id) => ['org', 'letterTemplates', id],
  overview: (userId) => ['org', 'overview', userId],
}

export function useOrgWorkplacesQuery() {
  return useQuery({
    queryKey: orgQueryKeys.workplaces,
    queryFn: getAllWorkplaces,
  })
}

export function useOrgUsersQuery() {
  return useQuery({
    queryKey: orgQueryKeys.users,
    queryFn: getAllClinicianProfiles,
  })
}

export function useOrgServicesQuery() {
  return useQuery({
    queryKey: orgQueryKeys.services,
    queryFn: getAllOrgServices,
  })
}

export function useProgressNoteTemplatesQuery() {
  return useQuery({
    queryKey: orgQueryKeys.progressNoteTemplates,
    queryFn: getProgressNoteTemplates,
  })
}

export function useLetterTemplatesQuery() {
  return useQuery({
    queryKey: orgQueryKeys.letterTemplates,
    queryFn: getLetterTemplates,
  })
}

export function useProgressNoteTemplateQuery(templateId, { enabled = true } = {}) {
  return useQuery({
    queryKey: orgQueryKeys.progressNoteTemplate(templateId),
    queryFn: () => getProgressNoteTemplate(templateId),
    enabled: enabled && Boolean(templateId) && templateId !== 'new',
  })
}

export function useLetterTemplateQuery(templateId, { enabled = true } = {}) {
  return useQuery({
    queryKey: orgQueryKeys.letterTemplate(templateId),
    queryFn: () => getLetterTemplate(templateId),
    enabled: enabled && Boolean(templateId) && templateId !== 'new',
  })
}

export function useServiceLeadOverviewQuery(userId) {
  return useQuery({
    queryKey: orgQueryKeys.overview(userId),
    queryFn: () => buildServiceLeadOverview(userId),
    enabled: Boolean(userId),
  })
}

function invalidateOrgLists(queryClient) {
  queryClient.invalidateQueries({ queryKey: orgQueryKeys.org })
}

export function useAddWorkplaceMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Parameters<typeof addWorkplace>[0]) => addWorkplace(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.workplaces })
      invalidateOrgLists(queryClient)
    },
  })
}

export function useAddClinicianUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Parameters<typeof addClinicianUser>[0]) => addClinicianUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.users })
      invalidateOrgLists(queryClient)
    },
  })
}

export function useAddOrgServiceMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Parameters<typeof addOrgService>[0]) => addOrgService(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.services })
      invalidateOrgLists(queryClient)
    },
  })
}

export function useSaveProgressNoteTemplateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Parameters<typeof saveProgressNoteTemplate>[0]) =>
      saveProgressNoteTemplate(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.progressNoteTemplates })
      queryClient.setQueryData(orgQueryKeys.progressNoteTemplate(String(saved.id)), saved)
    },
  })
}

export function useSaveLetterTemplateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Parameters<typeof saveLetterTemplate>[0]) => saveLetterTemplate(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: orgQueryKeys.letterTemplates })
      queryClient.setQueryData(orgQueryKeys.letterTemplate(String(saved.id)), saved)
    },
  })
}
