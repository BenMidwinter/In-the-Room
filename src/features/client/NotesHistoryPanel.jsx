import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import { getProfile, getAppointment } from '../../lib/store'
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
  { key: 'title', label: 'Note title', filter: { type: 'text', placeholder: 'Filter title…' } },
  { key: 'status', label: 'Status', filter: { type: 'select', allLabel: 'All statuses' } },
  { key: 'template', label: 'Note template', filter: { type: 'select', allLabel: 'All templates' } },
  { key: 'date', label: 'Date of note', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'appointment', label: 'Linked appointment', filter: { type: 'text', placeholder: 'Filter appointment…' } },
  { key: 'author', label: 'Created by', filter: { type: 'select', allLabel: 'All authors' } },
]

export default function NotesHistoryPanel() {
  const { clientId } = useClientSession()
  const navigate = useNavigate()
  const { data: notes = [] } = useProgressNotesFeedQuery(clientId)

  const rows = useMemo(() => notes.map(note => {
    const author = getProfile(note.author_id)
    const appt = note.appointment_id ? getAppointment(note.appointment_id) : null
    const status = progressNoteHistoryStatusLabel(note)
    return {
      id: note.id,
      note,
      filterValues: {
        status,
        title: note.title,
        template: note.template_name || '—',
        date: formatDisplayDate(note.session_date),
        appointment: appt ? formatSessionDateTime(appt) : 'None',
        author: author?.full_name || '—',
      },
      cells: {
        title: <span className="record-table__primary">{note.title}</span>,
        status: <NoteStatusTag status={status} />,
        template: note.template_name || '—',
        date: formatDisplayDate(note.session_date),
        appointment: appt
          ? formatSessionDateTime(appt)
          : <span className="record-table__cell-muted">None</span>,
        author: author?.full_name || '—',
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
      title="Notes history"
      subtitle="All progress notes — linked to appointments or recorded independently."
      newLabel="progress note"
      onNew={() => navigate(`/clients/${clientId}/progress-notes`)}
    >
      <RecordTable
        columns={NOTE_COLUMNS}
        rows={rows}
        emptyMessage="No progress notes recorded yet."
        onRowClick={openNote}
      />
    </RecordListLayout>
  )
}
