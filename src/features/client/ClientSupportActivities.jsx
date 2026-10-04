import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { getProfile } from '../../lib/store'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { appointmentDisplayName } from '../../lib/calendarServiceStyles'
import { formatSessionDateTime, isSupportActivity } from '../../lib/appointmentUtils'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'

const SUPPORT_COLUMNS = [
  { key: 'service', label: 'Activity', filter: { type: 'text', placeholder: 'Filter activity…' } },
  { key: 'date', label: 'Date', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'clinician', label: 'Clinician', filter: { type: 'select', allLabel: 'All clinicians' } },
]

export default function ClientSupportActivities() {
  const { id: clientId } = useParams()
  const overlay = useAppointmentOverlay()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)

  const rows = useMemo(() => {
    const sorted = appointments
      .filter((appt) => appt.client_id === clientId && isSupportActivity(appt))
      .sort((a, b) => {
        const dateCmp = String(b.session_date || '').localeCompare(String(a.session_date || ''))
        if (dateCmp !== 0) return dateCmp
        return String(b.start_time || '').localeCompare(String(a.start_time || ''))
      })

    return sorted.map((appt) => {
      const serviceLabel = appointmentDisplayName(appt)
      const clinician = getProfile(appt.clinician_id)?.full_name || appt.assigned_therapist || '—'
      return {
        id: appt.id,
        appt,
        filterValues: {
          service: serviceLabel,
          date: formatSessionDateTime(appt),
          clinician,
        },
        cells: {
          service: <span className="record-table__primary">{serviceLabel}</span>,
          date: formatSessionDateTime(appt),
          clinician,
        },
      }
    })
  }, [appointments, clientId])

  return (
    <RecordListLayout
      title="Support activities"
      newLabel="support activity"
      onNew={() => overlay.openCreate({
        clientId,
        lockedClient: true,
        manual: true,
        bookingKind: 'support',
      })}
    >
      <RecordTable
        columns={SUPPORT_COLUMNS}
        rows={rows}
        emptyMessage="No support activities yet."
        onRowClick={(row) => overlay.openView(row.appt)}
      />
    </RecordListLayout>
  )
}
