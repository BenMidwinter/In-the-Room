import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import { getAppointment } from '../../lib/store'
import { useProgressNotesFeedQuery } from '../../lib/progressNoteQueries'
import { formatDisplayDate } from '../../lib/dateArchitecture'
import { progressNoteHistoryStatusLabel } from '../../lib/progressNoteLifecycle'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { formatSessionDateTime } from '../../lib/appointmentUtils'

function NoteStatusTag({ status }) {
  const isComplete = status === 'COMPLETE'
  return (
    <span className={`badge note-status-tag${isComplete ? ' badge-green' : ' badge-grey'}`}>
      {status}
    </span>
  )
}

const NOTE_COLUMNS = [
  { key: 'title', label: 'Note', filter: 'text' },
  { key: 'status', label: 'Status', filter: 'choice' },
  { key: 'template', label: 'Template', filter: 'choice' },
  { key: 'date', label: 'Date', filter: 'text', sort: 'date' },
  { key: 'appointment', label: 'Appointment', filter: 'text', sort: 'date' },
]

export default function NotesHistoryPanel() {
  const { clientId } = useClientSession()
  const navigate = useNavigate()
  const { data: notes = [] } = useProgressNotesFeedQuery(clientId)

  const rows = useMemo(() => notes.map(note => {
    const appt = note.appointment_id ? getAppointment(note.appointment_id) : null
    const status = progressNoteHistoryStatusLabel(note)
    const when = formatDisplayDate(note.session_date)
    const appointmentLabel = appt ? formatSessionDateTime(appt) : ''
    return {
      id: note.id,
      note,
      filterValues: {
        status,
        title: note.title,
        template: note.template_name || '',
        date: when,
        appointment: appointmentLabel || 'None',
      },
      sortValues: {
        title: note.title,
        date: note.session_date || '',
        appointment: appt ? `${appt.session_date || ''}T${appt.start_time || ''}` : '',
      },
      cells: {
        title: <span className="record-table__primary">{note.title}</span>,
        status: <NoteStatusTag status={status} />,
        template: note.template_name || <span className="record-table__cell-muted">—</span>,
        date: when,
        appointment: appointmentLabel
          ? appointmentLabel
          : <span className="record-table__cell-muted">None</span>,
      },
    }
  }), [notes])

  const openNote = (row) => {
    const { note } = row
    if (note.appointment_id) {
      navigate(`/clients/${clientId}/progress-notes?appointment=${note.appointment_id}`)
    } else {
      navigate(`/clients/${clientId}/progress-notes?note=${note.id}`)
    }
  }

  return (
    <RecordListLayout
      title="Process Notes"
    >
      <RecordTable
        columns={NOTE_COLUMNS}
        rows={rows}
        countNoun="notes"
        defaultSort={{ key: 'date', direction: 'desc' }}
        emptyMessage="No Process Notes recorded yet."
        onRowClick={openNote}
      />
    </RecordListLayout>
  )
}
