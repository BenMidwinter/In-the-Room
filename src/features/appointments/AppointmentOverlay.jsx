import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useAppSession } from '../../lib/AppSessionContext'
import { useAppClients } from '../../lib/queries'
import {
  useAllAppointmentsQuery,
  useAppointmentQuery,
  useDeleteAppointmentsMutation,
  useSaveAppointmentMutation,
} from '../../lib/appointmentQueries'
import { EventDrawer, RecurringSchedulePanel, ScheduleSessionPanel } from '../../components/LayoutComponents'
import FormOverlay from '../../components/FormOverlay'
import SeriesScopeDialog from '../../components/SeriesScopeDialog'
import { useConfirm, useToast } from '../../components/ui'
import { appointmentBelongsToSeries, countSeriesScope, newSeriesId } from '../../lib/appointmentSeries'
import { addDaysYmd, todayYmd } from '../../lib/dateArchitecture'
import { BOOKING_KINDS, bookingKindById, bookingKindForBlockRole } from '../../lib/scheduling/bookingKinds'

const AppointmentOverlayContext = createContext(null)

export function useAppointmentOverlay() {
  const ctx = useContext(AppointmentOverlayContext)
  if (!ctx) {
    throw new Error('Appointment overlay is unavailable')
  }
  return ctx
}

export function AppointmentOverlayProvider({ children }) {
  const [state, setState] = useState(null)
  const handlersRef = useRef({})

  const close = useCallback(() => {
    setState(null)
    handlersRef.current.onClose?.()
  }, [])

  const openView = useCallback((appointment) => {
    if (!appointment || appointment.is_external_busy) return
    if (typeof appointment === 'string') {
      setState({ mode: 'view', appointmentId: appointment, appointment: null })
      return
    }
    setState({ mode: 'view', appointment })
  }, [])

  const openCreate = useCallback((draft = {}) => {
    const sessionDate = draft.sessionDate || todayYmd()
    const startTime = draft.startTime || '09:00'
    const clientId = draft.clientId || draft.prefill?.client_id || null
    const base = {
      sessionDate,
      startTime,
      manual: draft.manual !== false,
      lockedClient: Boolean(draft.lockedClient),
      clientId,
      outsideAvailability: Boolean(draft.outsideAvailability),
      prefill: draft.prefill || (clientId
        ? { client_id: clientId, session_date: sessionDate, start_time: startTime }
        : null),
    }
    if (draft.bookingKind) {
      const kind = bookingKindById(draft.bookingKind)
      const attachClient = kind.client !== 'none' && clientId
      setState({
        ...base,
        mode: 'create',
        bookingKind: kind.id,
        lockedClient: kind.client === 'required' && Boolean(draft.lockedClient || clientId),
        prefill: attachClient ? base.prefill : null,
      })
      return
    }
    setState({ ...base, mode: 'choose' })
  }, [])

  const openEdit = useCallback((appointment) => {
    if (!appointment?.id || appointment.is_external_busy) return
    setState({
      mode: 'edit',
      appointment,
      sessionDate: appointment.session_date,
      startTime: appointment.start_time,
    })
  }, [])

  const openRecurring = useCallback((appointment) => {
    if (!appointment) return
    setState({ mode: 'recurring', appointment })
  }, [])

  const register = useCallback((handlers) => {
    const previous = handlersRef.current
    handlersRef.current = { ...previous, ...handlers }
    return () => {
      const current = handlersRef.current
      const next = { ...current }
      for (const key of Object.keys(handlers)) {
        if (next[key] === handlers[key]) delete next[key]
      }
      handlersRef.current = next
    }
  }, [])

  const api = useMemo(() => ({
    openView,
    openCreate,
    openEdit,
    openRecurring,
    close,
    register,
  }), [openView, openCreate, openEdit, openRecurring, close, register])

  return (
    <AppointmentOverlayContext.Provider value={api}>
      {children}
      <AppointmentOverlayHost
        state={state}
        setState={setState}
        handlersRef={handlersRef}
        close={close}
        openEdit={openEdit}
        openCreate={openCreate}
        openRecurring={openRecurring}
      />
    </AppointmentOverlayContext.Provider>
  )
}

function AppointmentOverlayHost({
  state,
  setState,
  handlersRef,
  close,
  openEdit,
  openCreate,
  openRecurring,
}) {
  const { session } = useAppSession()
  const { clients: remoteClients = [] } = useAppClients()
  const { data: allAppointments = [] } = useAllAppointmentsQuery()
  const saveAppointmentMutation = useSaveAppointmentMutation()
  const deleteAppointmentsMutation = useDeleteAppointmentsMutation()
  const confirm = useConfirm()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteScopeFor, setDeleteScopeFor] = useState(null)

  const clients = useMemo(
    () => remoteClients.filter((client) => client.is_active || client.on_waitlist),
    [remoteClients],
  )

  const viewId = state?.mode === 'view'
    ? (state.appointment?.id || state.appointmentId || null)
    : null
  const appointmentQuery = useAppointmentQuery(viewId, {
    enabled: Boolean(viewId) && !state?.appointment,
  })
  const viewed = state?.mode === 'view'
    ? (
      allAppointments.find((row) => row.id === viewId)
      || state.appointment
      || appointmentQuery.data
      || null
    )
    : null

  const handleSave = async (payload, scope = 'this') => {
    if (!session?.user?.id) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    setSaving(true)
    try {
      const dates = payload.dates?.length ? payload.dates : [payload.session_date]
      const seriesId = payload.series_id || (dates.length > 1 ? newSeriesId() : undefined)

      if (payload.id && !payload.dates?.length) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            dates: undefined,
            series_id: payload.series_id || undefined,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
          scope,
          allAppointments,
        })
        if (saved) {
          setState({ mode: 'view', appointment: saved })
          handlersRef.current.onSaved?.(saved, { created: false })
          toast.saved(scope === 'this' ? 'Booking updated' : 'Series updated')
        } else {
          close()
        }
        return
      }

      let first = null
      for (const date of dates) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            session_date: date,
            dates: undefined,
            series_id: seriesId,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
        })
        if (!first) first = saved
      }
      close()
      if (first) handlersRef.current.onSaved?.(first, { created: true })
      const kindId = state?.bookingKind
      const savedLabel = kindId === 'busy'
        ? 'Busy time blocked'
        : `${bookingKindById(kindId).label} booked`
      toast.saved(dates.length > 1 ? `Booked ${dates.length} sessions` : savedLabel)
    } finally {
      setSaving(false)
    }
  }

  const handleRecurringSave = async (payload) => {
    if (!session?.user?.id) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    setSaving(true)
    try {
      const seriesId = payload.series_id || (payload.dates?.length > 1 ? newSeriesId() : undefined)
      let first = null
      for (const date of payload.dates) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            client_id: payload.client_id,
            session_date: date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            duration_minutes: payload.duration_minutes,
            therapy_modality: payload.therapy_modality,
            service_id: payload.service_id,
            service_name: payload.service_name,
            series_id: seriesId,
            location: payload.location,
            other_info: payload.other_info,
            appointment_type: payload.appointment_type,
            clinician_id: payload.clinician_id || session.user.id,
            block_role: payload.block_role || 'client_session',
          },
          userId: session.user.id,
        })
        if (!first) first = saved
      }
      close()
      if (first) handlersRef.current.onSaved?.(first, { created: true })
      toast.saved(payload.dates?.length > 1 ? `Booked ${payload.dates.length} sessions` : 'Appointment booked')
    } finally {
      setSaving(false)
    }
  }

  const runDelete = async (appointment, scope = 'this') => {
    setDeleting(true)
    try {
      await deleteAppointmentsMutation.mutateAsync({
        appointment,
        scope,
        allAppointments,
      })
      setDeleteScopeFor(null)
      close()
      toast.saved(scope === 'this' ? 'Appointment deleted' : 'Appointments deleted')
    } finally {
      setDeleting(false)
    }
  }

  const handleDelete = async (appointment, scope) => {
    if (!appointment) return
    if (scope) {
      await runDelete(appointment, scope)
      return
    }
    if (appointmentBelongsToSeries(appointment, allAppointments)) {
      setDeleteScopeFor(appointment)
      return
    }
    const ok = await confirm({
      title: 'Delete appointment?',
      message: `Remove the session on ${appointment.session_date} at ${appointment.start_time}?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await runDelete(appointment, 'this')
  }

  const handleAttendanceChange = async (status) => {
    if (!viewed || !session?.user?.id) return
    const saved = await saveAppointmentMutation.mutateAsync({
      payload: {
        id: viewed.id,
        client_id: viewed.client_id,
        session_date: viewed.session_date,
        start_time: viewed.start_time,
        end_time: viewed.end_time,
        appointment_type: viewed.appointment_type,
        therapy_modality: viewed.therapy_modality,
        service_id: viewed.service_id,
        service_name: viewed.service_name,
        location: viewed.location,
        other_info: viewed.other_info,
        block_role: viewed.block_role || 'client_session',
        clinician_id: viewed.clinician_id,
        attendance_status: status,
      },
      userId: session.user.id,
    })
    if (saved) setState({ mode: 'view', appointment: saved })
  }

  const handleMove = (appointment) => {
    if (handlersRef.current.onMove) {
      setState(null)
      handlersRef.current.onMove(appointment)
      return
    }
    openEdit(appointment)
  }

  if (!state) {
    return deleteScopeFor ? (
      <SeriesScopeDialog
        action="delete"
        onCancel={() => setDeleteScopeFor(null)}
        countForScope={(scope) => countSeriesScope(deleteScopeFor, allAppointments, scope)}
        onSelect={(scope) => runDelete(deleteScopeFor, scope)}
      />
    ) : null
  }

  const showSchedule = state.mode === 'create' || state.mode === 'edit'
  const editing = state.mode === 'edit' ? state.appointment : null
  const bookingKind = state.mode === 'edit'
    ? bookingKindForBlockRole(editing?.block_role)
    : (state.bookingKind || 'appointment')

  const chooseKind = (kindId) => {
    const kind = bookingKindById(kindId)
    const clientId = state.clientId || state.prefill?.client_id || null
    const attachClient = kind.client !== 'none' && clientId
    setState({
      mode: 'create',
      bookingKind: kind.id,
      sessionDate: state.sessionDate,
      startTime: state.startTime,
      manual: state.manual,
      outsideAvailability: state.outsideAvailability,
      lockedClient: kind.client === 'required' && Boolean(state.lockedClient || clientId),
      clientId,
      prefill: attachClient
        ? {
          ...(state.prefill || {}),
          client_id: clientId,
          session_date: state.sessionDate,
          start_time: state.startTime,
        }
        : null,
    })
  }

  return (
    <>
      {state.mode === 'choose' && (
        <FormOverlay
          title="New booking"
          eyebrow="Calendar"
          meta={state.outsideAvailability ? 'Outside your usual availability' : `${state.sessionDate} · ${state.startTime}`}
          onClose={close}
          size="sm"
        >
          <div className="booking-kind-menu" role="menu" aria-label="Booking type">
            {BOOKING_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                role="menuitem"
                className="booking-kind-menu__option"
                onClick={() => chooseKind(kind.id)}
              >
                <span className="booking-kind-menu__label">{kind.label}</span>
                <span className="booking-kind-menu__detail">{kind.detail}</span>
              </button>
            ))}
          </div>
          {state.outsideAvailability && (
            <p className="booking-kind-menu__hint text-small text-muted">
              Busy is for blocking time you are unexpectedly unavailable.
            </p>
          )}
        </FormOverlay>
      )}

      {state.mode === 'view' && !viewed && (
        <FormOverlay title="Loading appointment…" eyebrow="Appointment" onClose={close} size="md">
          <p className="text-muted">
            {appointmentQuery.isError ? 'This appointment could not be loaded.' : 'Loading appointment…'}
          </p>
        </FormOverlay>
      )}

      {state.mode === 'view' && viewed && (
        <EventDrawer
          appointment={viewed}
          allAppointments={allAppointments}
          presentation="overlay"
          onClose={close}
          onAttendanceChange={handleAttendanceChange}
          onEdit={openEdit}
          onMove={handleMove}
          onDelete={handleDelete}
        />
      )}

      {state.mode === 'recurring' && (
        <RecurringSchedulePanel
          key={state.appointment.id}
          source={state.appointment}
          onSave={handleRecurringSave}
          onCancel={close}
          saving={saving}
          presentation="overlay"
        />
      )}

      {showSchedule && (
        <ScheduleSessionPanel
          key={`${state.mode}-${bookingKind}-${editing?.id || state.prefill?.client_id || 'new'}-${state.sessionDate}-${state.startTime}`}
          sessionDate={state.sessionDate}
          startTime={state.startTime}
          appointment={editing}
          prefill={state.mode === 'create' ? state.prefill : null}
          clients={clients}
          allAppointments={allAppointments}
          sessionUserId={session.user.id}
          myWorkplace={null}
          showDateField={state.mode === 'edit' || state.manual}
          presentation="overlay"
          lockedClient={Boolean(state.lockedClient)}
          bookingKind={bookingKind}
          outsideAvailability={Boolean(state.outsideAvailability)}
          onChangeKind={state.mode === 'create' ? () => setState((current) => (
            current ? { ...current, mode: 'choose' } : current
          )) : undefined}
          onSave={handleSave}
          onDelete={editing ? handleDelete : undefined}
          onBookAnother={(appt) => {
            const sessionDate = addDaysYmd(appt.session_date, 7)
            openCreate({
              bookingKind: bookingKindForBlockRole(appt.block_role),
              clientId: appt.client_id,
              sessionDate,
              startTime: appt.start_time,
              lockedClient: Boolean(appt.client_id) && bookingKindForBlockRole(appt.block_role) !== 'admin',
              manual: true,
              prefill: { ...appt, session_date: sessionDate },
            })
          }}
          onScheduleMore={openRecurring}
          onCancel={() => (editing ? setState({ mode: 'view', appointment: editing }) : close())}
          saving={saving}
          deleting={deleting}
        />
      )}

      {deleteScopeFor && (
        <SeriesScopeDialog
          action="delete"
          onCancel={() => setDeleteScopeFor(null)}
          countForScope={(scope) => countSeriesScope(deleteScopeFor, allAppointments, scope)}
          onSelect={(scope) => runDelete(deleteScopeFor, scope)}
        />
      )}
    </>
  )
}
