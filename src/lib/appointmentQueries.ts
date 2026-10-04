import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  deleteAppointmentsByIds,
  fetchAllAppointments,
  fetchAppointment,
  fetchAppointmentsForClient,
  fetchUpcomingAppointments,
  saveAppointmentForUser,
  updateAppointmentsInScope,
} from './supabase/appointmentsRepo'
import { resolveSeriesScopeIds, type SeriesScope } from './appointmentSeries'

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

function invalidateAppointmentLists(queryClient) {
  queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.appointments })
  queryClient.invalidateQueries({ queryKey: appointmentQueryKeys.all })
}

export function useSaveAppointmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      payload,
      userId,
      scope = 'this',
      allAppointments = [],
    }: {
      payload: Record<string, unknown>
      userId: string
      scope?: SeriesScope
      allAppointments?: { id: string; session_date?: string; series_id?: string | null }[]
    }) => {
      if (scope === 'this' || !payload.id) {
        return saveAppointmentForUser(payload, userId)
      }
      const ids = resolveSeriesScopeIds(
        {
          id: String(payload.id),
          session_date: String(payload.session_date || ''),
          series_id: payload.series_id ? String(payload.series_id) : null,
        },
        allAppointments,
        scope,
      )
      return updateAppointmentsInScope(ids, payload, userId, String(payload.id))
    },
    onSuccess: (saved) => {
      invalidateAppointmentLists(queryClient)
      if (saved?.id) {
        queryClient.setQueryData(appointmentQueryKeys.detail(String(saved.id)), saved)
      }
      if (saved?.client_id) {
        queryClient.invalidateQueries({ queryKey: ['episodes', 'client', saved.client_id] })
      }
    },
  })
}

export function useDeleteAppointmentsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      appointment,
      scope = 'this',
      allAppointments = [],
    }: {
      appointment: { id: string; session_date?: string; series_id?: string | null }
      scope?: SeriesScope
      allAppointments?: { id: string; session_date?: string; series_id?: string | null }[]
    }) => {
      const ids = resolveSeriesScopeIds(appointment, allAppointments, scope)
      return deleteAppointmentsByIds(ids)
    },
    onSuccess: () => {
      invalidateAppointmentLists(queryClient)
    },
  })
}
