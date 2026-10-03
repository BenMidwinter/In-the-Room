import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  getAllAppointments,
  getAppointmentsForClient,
  getAppointment,
  getUpcomingAppointments,
  saveAppointment,
} from './store'

export const appointmentQueryKeys = {
  appointments: ['appointments'],
  all: ['appointments', 'all'],
  client: (clientId) => ['appointments', 'client', clientId],
  upcoming: (userId, workplaceId, organisationWide) =>
    ['appointments', 'upcoming', { userId, workplaceId, organisationWide }],
  detail: (appointmentId) => ['appointments', 'detail', appointmentId],
}

export function useAllAppointmentsQuery() {
  return useQuery({
    queryKey: appointmentQueryKeys.all,
    queryFn: getAllAppointments,
    placeholderData: keepPreviousData,
  })
}

export function useClientAppointmentsQuery(clientId) {
  return useQuery({
    queryKey: appointmentQueryKeys.client(clientId),
    queryFn: () => getAppointmentsForClient(clientId),
    enabled: Boolean(clientId),
    placeholderData: keepPreviousData,
  })
}

export function useUpcomingAppointmentsQuery({ userId, myWorkplace, organisationWide = false }) {
  return useQuery({
    queryKey: appointmentQueryKeys.upcoming(userId, myWorkplace?.id ?? null, organisationWide),
    queryFn: () => getUpcomingAppointments(userId, myWorkplace, { organisationWide }),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
}

export function useAppointmentQuery(appointmentId, { enabled = true } = {}) {
  return useQuery({
    queryKey: appointmentQueryKeys.detail(appointmentId),
    queryFn: () => getAppointment(appointmentId),
    enabled: enabled && Boolean(appointmentId) && appointmentId !== 'new',
  })
}

export function useSaveAppointmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ payload, userId }: { payload: Parameters<typeof saveAppointment>[0]; userId: string }) =>
      saveAppointment(payload, userId),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.appointments })
      queryClient.setQueryData(appointmentQueryKeys.detail(String(saved.id)), saved)
    },
  })
}
