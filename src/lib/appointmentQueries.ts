import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  fetchAllAppointments,
  fetchAppointment,
  fetchAppointmentsForClient,
  fetchUpcomingAppointments,
  saveAppointmentForUser,
} from './supabase/appointmentsRepo'

export const appointmentQueryKeys = {
  appointments: ['appointments'],
  all: ['appointments', 'all'],
  client: (clientId) => ['appointments', 'client', clientId],
  upcoming: (userId, workplaceId, organisationWide) =>
    ['appointments', 'upcoming', { userId, workplaceId, organisationWide }],
  detail: (appointmentId) => ['appointments', 'detail', appointmentId],
  externalBusy: ['appointments', 'external-busy'],
}

export function useAllAppointmentsQuery() {
  return useQuery({
    queryKey: appointmentQueryKeys.all,
    queryFn: fetchAllAppointments,
    placeholderData: keepPreviousData,
  })
}

export function useClientAppointmentsQuery(clientId) {
  return useQuery({
    queryKey: appointmentQueryKeys.client(clientId),
    queryFn: () => fetchAppointmentsForClient(clientId),
    enabled: Boolean(clientId),
    placeholderData: keepPreviousData,
  })
}

export function useUpcomingAppointmentsQuery({ userId, myWorkplace, organisationWide = false }) {
  return useQuery({
    queryKey: appointmentQueryKeys.upcoming(userId, myWorkplace?.id ?? null, organisationWide),
    queryFn: () => fetchUpcomingAppointments(userId, myWorkplace, { organisationWide }),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
}

export function useAppointmentQuery(appointmentId, { enabled = true } = {}) {
  return useQuery({
    queryKey: appointmentQueryKeys.detail(appointmentId),
    queryFn: () => fetchAppointment(appointmentId),
    enabled: enabled && Boolean(appointmentId) && appointmentId !== 'new',
  })
}

export function useSaveAppointmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ payload, userId }: { payload: Record<string, unknown>; userId: string }) =>
      saveAppointmentForUser(payload, userId),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.appointments })
      queryClient.setQueryData(appointmentQueryKeys.detail(String(saved.id)), saved)
    },
  })
}
