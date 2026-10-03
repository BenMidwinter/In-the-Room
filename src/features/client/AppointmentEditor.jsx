import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import { useAppSession } from '../../lib/AppSessionContext'
import {
  useAllAppointmentsQuery,
  useAppointmentQuery,
  useDeleteAppointmentsMutation,
  useSaveAppointmentMutation,
} from '../../lib/appointmentQueries'
import { ScheduleSessionPanel } from '../../components/LayoutComponents'
import { useConfirm, useToast } from '../../components/ui'
import { appointmentBelongsToSeries, countSeriesScope } from '../../lib/appointmentSeries'
import SeriesScopeDialog from '../../components/SeriesScopeDialog'
import { formatSessionDateTime } from '../../lib/appointmentUtils'
import { DEMO_TODAY } from '../../lib/dateArchitecture'

/**
 * Client appointment route — opens the same centred overlay editor used on the calendar.
 */
export default function AppointmentEditor() {
  const { appointmentId } = useParams()
  const navigate = useNavigate()
  const { clientId, client, session } = useClientSession()
  const { myWorkplace } = useAppSession()
  const toast = useToast()
  const confirm = useConfirm()
  const isNew = appointmentId === 'new'
  const appointmentQuery = useAppointmentQuery(appointmentId, { enabled: !isNew })
  const { data: allAppointments = [] } = useAllAppointmentsQuery()
  const saveAppointmentMutation = useSaveAppointmentMutation()
  const deleteAppointmentsMutation = useDeleteAppointmentsMutation()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false)

  const base = `/clients/${clientId}/appointments`
  const appointment = isNew ? null : appointmentQuery.data
  const clientAppointments = useMemo(
    () => allAppointments.filter((a) => a.client_id === clientId),
    [allAppointments, clientId],
  )

  const close = () => navigate(base)

  const handleSave = async (payload, scope = 'this') => {
    if (!session?.user?.id) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    setSaving(true)
    try {
      const dates = payload.dates?.length ? payload.dates : [payload.session_date]
      const seriesId = payload.series_id
        || (dates.length > 1
          ? (typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `series-${Date.now()}`)
          : undefined)

      if (payload.id && !payload.dates?.length) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            client_id: clientId,
            dates: undefined,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
          scope,
          allAppointments: clientAppointments,
        })
        toast.saved(scope === 'this' ? 'Appointment updated' : 'Series updated')
        navigate(`${base}/${saved.id}`, { replace: true })
        close()
        return
      }

      let first = null
      for (const date of dates) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            client_id: clientId,
            session_date: date,
            dates: undefined,
            series_id: seriesId,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
        })
        if (!first) first = saved
      }
      toast.saved(dates.length > 1 ? `Booked ${dates.length} sessions` : 'Appointment booked')
      if (first) navigate(`${base}/${first.id}`, { replace: true })
      close()
    } finally {
      setSaving(false)
    }
  }

  const runDelete = async (scope = 'this') => {
    if (!appointment) return
    setDeleting(true)
    try {
      await deleteAppointmentsMutation.mutateAsync({
        appointment,
        scope,
        allAppointments: clientAppointments,
      })
      toast.saved(scope === 'this' ? 'Appointment deleted' : 'Appointments deleted')
      close()
    } finally {
      setDeleting(false)
      setDeleteScopeOpen(false)
    }
  }

  const handleDelete = async (_appt, scope) => {
    if (!appointment) return
    if (scope) {
      await runDelete(scope)
      return
    }
    if (appointmentBelongsToSeries(appointment, clientAppointments)) {
      setDeleteScopeOpen(true)
      return
    }
    const ok = await confirm({
      title: 'Delete appointment?',
      message: `Remove the session on ${appointment.session_date} at ${appointment.start_time}?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await runDelete('this')
  }

  if (!isNew && appointmentQuery.isLoading) {
    return (
      <div className="client-panel appointment-editor">
        <p className="text-muted">Loading appointment…</p>
      </div>
    )
  }

  if (!isNew && !appointment) {
    return (
      <div className="client-panel appointment-editor">
        <p className="text-muted">Appointment not found.</p>
        <button type="button" className="secondary" onClick={close}>Back to appointments</button>
      </div>
    )
  }

  const heading = isNew
    ? 'New appointment'
    : formatSessionDateTime(appointment)

  return (
    <div className="client-panel appointment-editor">
      <div className="record-module__header">
        <div className="record-module__header-text">
          <h2 className="record-module__title">{heading}</h2>
          <p className="record-module__subtitle">
            {isNew ? 'Schedule a session for this client.' : 'Edit in the overlay — same editor as the calendar.'}
          </p>
        </div>
        <div className="record-module__actions">
          <button type="button" className="secondary" onClick={close}>All appointments</button>
        </div>
      </div>

      <ScheduleSessionPanel
        sessionDate={appointment?.session_date || DEMO_TODAY}
        startTime={appointment?.start_time || '09:00'}
        appointment={isNew ? null : appointment}
        prefill={isNew ? { client_id: clientId, session_date: DEMO_TODAY, start_time: '09:00' } : null}
        clients={client ? [client] : []}
        allAppointments={clientAppointments}
        sessionUserId={session.user.id}
        myWorkplace={myWorkplace}
        showDateField
        presentation="overlay"
        lockedClient
        onSave={handleSave}
        onDelete={isNew ? undefined : handleDelete}
        onCancel={close}
        saving={saving}
        deleting={deleting}
      />

      {deleteScopeOpen && appointment && (
        <SeriesScopeDialog
          action="delete"
          onCancel={() => setDeleteScopeOpen(false)}
          countForScope={(scope) => countSeriesScope(appointment, clientAppointments, scope)}
          onSelect={(scope) => runDelete(scope)}
        />
      )}
    </div>
  )
}
