import { useMemo } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { getProfile } from '../../lib/store'
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
  { key: 'service', label: 'Service', filter: { type: 'text', placeholder: 'Filter service…' } },
  { key: 'date', label: 'Appointment date', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'clinician', label: 'Clinician', filter: { type: 'select', allLabel: 'All clinicians' } },
  { key: 'attendance', label: 'Attendance', filter: { type: 'select', allLabel: 'All attendance' } },
  { key: 'note', label: 'Process Note', filter: { type: 'text', placeholder: 'Filter note…' } },
]

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

  const rows = useMemo(() => {
    const sorted = appointments
      .filter((appt) => appt.client_id === clientId && isClientSessionAppointment(appt) && !appt.parent_appointment_id)
      .sort((a, b) => {
        const dateCmp = String(b.session_date || '').localeCompare(String(a.session_date || ''))
        if (dateCmp !== 0) return dateCmp
        return String(b.start_time || '').localeCompare(String(a.start_time || ''))
      })

    return sorted.map(appt => {
      const linkedNote = noteByAppointment.get(appt.id) || null
      const noteStatus = notesQuery.isFetched
        ? processNoteAppointmentStatus(linkedNote)
        : '…'
      const isCancelled = appt.attendance_status === 'cancelled'
      const serviceLabel = appointmentDisplayName(appt)
      return {
        id: appt.id,
        appt,
        muted: isCancelled,
        filterValues: {
          service: serviceLabel,
          date: formatSessionDateTime(appt),
          clinician: getProfile(appt.clinician_id)?.full_name || appt.assigned_therapist || '—',
          attendance: attendanceLabel(appt.attendance_status),
          note: noteStatus,
        },
        cells: {
          service: (
            <span className="record-table__primary">
              {serviceLabel}
            </span>
          ),
          date: formatSessionDateTime(appt),
          clinician: getProfile(appt.clinician_id)?.full_name || appt.assigned_therapist || '—',
          attendance: (
            <span className={`badge ${attendanceBadgeClass(appt.attendance_status)}`}>
              {attendanceLabel(appt.attendance_status)}
            </span>
          ),
          note: (
            <Link
              to={`/clients/${clientId}/progress-notes?appointment=${appt.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              {noteStatus}
            </Link>
          ),
        },
      }
    })
  }, [appointments, clientId, noteByAppointment, notesQuery.isFetched])

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
          emptyMessage="No appointments recorded yet."
          onRowClick={(row) => overlay.openView(row.appt)}
        />
      </RecordListLayout>
      <Outlet />
    </>
  )
}
