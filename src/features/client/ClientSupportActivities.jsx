import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { appointmentDisplayName } from '../../lib/calendarServiceStyles'
import { formatSessionDateTime, isSupportActivity } from '../../lib/appointmentUtils'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'

const SUPPORT_COLUMNS = [
  { key: 'service', label: 'Activity', filter: 'text' },
  { key: 'date', label: 'Date', filter: 'text', sort: 'date' },
]

export default function ClientSupportActivities() {
  const { id: clientId } = useParams()
  const overlay = useAppointmentOverlay()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)

  const rows = useMemo(() => appointments
    .filter((appt) => appt.client_id === clientId && isSupportActivity(appt))
    .map((appt) => {
      const serviceLabel = appointmentDisplayName(appt)
      const when = formatSessionDateTime(appt)
      return {
        id: appt.id,
        appt,
        filterValues: {
          service: serviceLabel,
          date: when,
        },
        sortValues: {
          service: serviceLabel,
          date: `${appt.session_date || ''}T${appt.start_time || ''}`,
        },
        cells: {
          service: <span className="record-table__primary">{serviceLabel}</span>,
          date: when,
        },
      }
    }), [appointments, clientId])

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
        countNoun="activities"
        defaultSort={{ key: 'date', direction: 'desc' }}
        emptyMessage="No support activities yet."
        onRowClick={(row) => overlay.openView(row.appt)}
      />
    </RecordListLayout>
  )
}
