import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getProfile, getProgressNoteByAppointment } from '../../lib/store'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { modalityLabel } from '../../lib/calendarConstants'
import {
  formatSessionDateTime,
  attendanceLabel,
  attendanceBadgeClass,
} from '../../lib/appointmentUtils'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'

const APPT_COLUMNS = [
  { key: 'service', label: 'Service', filter: { type: 'text', placeholder: 'Filter service…' } },
  { key: 'date', label: 'Appointment date', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'clinician', label: 'Clinician', filter: { type: 'select', allLabel: 'All clinicians' } },
  { key: 'attendance', label: 'Attendance', filter: { type: 'select', allLabel: 'All attendance' } },
  { key: 'note', label: 'Progress note', filter: { type: 'text', placeholder: 'Filter note…' } },
]

export default function ClientAppointmentsIndex() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)

  const rows = useMemo(() => {
    const sorted = [...appointments].sort((a, b) => {
      const dateCmp = String(b.session_date || '').localeCompare(String(a.session_date || ''))
      if (dateCmp !== 0) return dateCmp
      return String(b.start_time || '').localeCompare(String(a.start_time || ''))
    })

    return sorted.map(appt => {
      const linkedNote = getProgressNoteByAppointment(appt.id)
      const isCancelled = appt.attendance_status === 'cancelled'
      return {
        id: appt.id,
        appt,
        muted: isCancelled,
        filterValues: {
          service: modalityLabel(appt.therapy_modality),
          date: formatSessionDateTime(appt),
          clinician: getProfile(appt.clinician_id)?.full_name || appt.assigned_therapist || '—',
          attendance: attendanceLabel(appt.attendance_status),
          note: linkedNote?.title || '—',
        },
        cells: {
          service: (
            <span className="record-table__primary">
              {modalityLabel(appt.therapy_modality)}
            </span>
          ),
          date: formatSessionDateTime(appt),
          clinician: getProfile(appt.clinician_id)?.full_name || appt.assigned_therapist || '—',
          attendance: (
            <span className={`badge ${attendanceBadgeClass(appt.attendance_status)}`}>
              {attendanceLabel(appt.attendance_status)}
            </span>
          ),
          note: linkedNote
            ? <span className="record-table__cell-muted">{linkedNote.title}</span>
            : <span className="record-table__cell-muted">—</span>,
        },
      }
    })
  }, [appointments])

  return (
    <RecordListLayout
      title="Appointments"
      subtitle="Scheduled sessions and attendance — open a row to view or edit."
      newLabel="appointment"
      onNew={() => navigate(`/clients/${clientId}/appointments/new`)}
    >
      <RecordTable
        columns={APPT_COLUMNS}
        rows={rows}
        emptyMessage="No appointments recorded yet."
        onRowClick={(row) => navigate(`/clients/${clientId}/appointments/${row.id}`)}
      />
    </RecordListLayout>
  )
}
