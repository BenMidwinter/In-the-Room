import { useMemo } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { useClientProgressNotesQuery } from '../../lib/progressNoteQueries'
import { processNoteAppointmentStatus } from '../../lib/progressNoteLifecycle'
import { appointmentDisplayName } from '../../lib/calendarServiceStyles'
import {
  formatSessionDateTime,
  attendanceLabel,
  attendanceBadgeClass,
  isClientSessionAppointment,
} from '../../lib/appointmentUtils'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'

const APPT_COLUMNS = [
  { key: 'service', label: 'Service', filter: 'text' },
  { key: 'date', label: 'Date', filter: 'text', sort: 'date' },
  { key: 'attendance', label: 'Attendance', filter: 'choice' },
  { key: 'note', label: 'Process note', filter: 'choice' },
]

function noteBadgeClass(status) {
  if (status === 'Complete') return 'badge badge-green'
  if (status === 'Draft') return 'badge badge-blue'
  return 'badge badge-grey'
}

export default function ClientAppointmentsIndex() {
  const { id: clientId } = useParams()
  const overlay = useAppointmentOverlay()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)
  const notesQuery = useClientProgressNotesQuery(clientId)

  const noteByAppointment = useMemo(() => {
    const map = new Map()
    for (const note of notesQuery.data || []) {
      if (note.appointment_id) map.set(note.appointment_id, note)
    }
    return map
  }, [notesQuery.data])

  const rows = useMemo(() => appointments
    .filter((appt) => appt.client_id === clientId && isClientSessionAppointment(appt) && !appt.parent_appointment_id)
    .map((appt) => {
      const linkedNote = noteByAppointment.get(appt.id) || null
      const noteStatus = notesQuery.isFetched
        ? processNoteAppointmentStatus(linkedNote)
        : '…'
      const isCancelled = appt.attendance_status === 'cancelled'
      const serviceLabel = appointmentDisplayName(appt)
      const when = formatSessionDateTime(appt)
      return {
        id: appt.id,
        appt,
        muted: isCancelled,
        filterValues: {
          service: serviceLabel,
          date: when,
          attendance: attendanceLabel(appt.attendance_status),
          note: noteStatus,
        },
        sortValues: {
          service: serviceLabel,
          date: `${appt.session_date || ''}T${appt.start_time || ''}`,
          attendance: attendanceLabel(appt.attendance_status),
          note: noteStatus,
        },
        cells: {
          service: <span className="record-table__primary">{serviceLabel}</span>,
          date: when,
          attendance: (
            <span className={`badge ${attendanceBadgeClass(appt.attendance_status)}`}>
              {attendanceLabel(appt.attendance_status)}
            </span>
          ),
          note: (
            <Link
              to={`/clients/${clientId}/progress-notes?appointment=${appt.id}`}
              className={`badge ${noteBadgeClass(noteStatus)}`}
              onClick={(event) => event.stopPropagation()}
            >
              {noteStatus}
            </Link>
          ),
        },
      }
    }), [appointments, clientId, noteByAppointment, notesQuery.isFetched])

  return (
    <>
      <RecordListLayout
        title="Appointments"
        newLabel="booking"
        onNew={() => overlay.openCreate({
          clientId,
          lockedClient: true,
          manual: true,
        })}
      >
        <RecordTable
          columns={APPT_COLUMNS}
          rows={rows}
          countNoun="appointments"
          defaultSort={{ key: 'date', direction: 'desc' }}
          emptyMessage="No appointments recorded yet."
          onRowClick={(row) => overlay.openView(row.appt)}
        />
      </RecordListLayout>
      <Outlet />
    </>
  )
}
