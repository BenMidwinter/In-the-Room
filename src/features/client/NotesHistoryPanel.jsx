import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ArchiveScopeToggle from '../../components/ArchiveScopeToggle'
import { useClientSession } from '../../lib/useClientSession'
import { filterByArchiveScope } from '../../lib/archiveScope'
import {
  useArchiveProgressNoteMutation,
  useDeleteProgressNoteMutation,
  useProgressNotesFeedQuery,
} from '../../lib/progressNoteQueries'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { formatDisplayDate } from '../../lib/dateArchitecture'
import { progressNoteHistoryStatusLabel } from '../../lib/progressNoteLifecycle'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { formatSessionDateTime } from '../../lib/appointmentUtils'
import { useConfirm, useToast } from '../../components/ui'

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
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function NotesHistoryPanel() {
  const { clientId } = useClientSession()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [archiveScope, setArchiveScope] = useState('active')
  const { data: notes = [], isPending, error } = useProgressNotesFeedQuery(clientId)
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)
  const removeNote = useDeleteProgressNoteMutation(clientId)
  const archiveNote = useArchiveProgressNoteMutation(clientId)

  const appointmentsById = useMemo(() => {
    const map = new Map()
    for (const appt of appointments) map.set(appt.id, appt)
    return map
  }, [appointments])

  const onDelete = async (note) => {
    const ok = await confirm({
      title: 'Delete this Process Note?',
      message: 'This permanently removes the note from the client record.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeNote.mutateAsync(note.id)
      toast.saved('Note deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this note')
    }
  }

  const onArchive = async (note) => {
    try {
      await archiveNote.mutateAsync({ id: note.id, archived: !note.archived_at })
      toast.saved(note.archived_at ? 'Note restored' : 'Note archived')
    } catch (err) {
      toast.error(err?.message || 'Could not update this note')
    }
  }

  const scopedNotes = useMemo(
    () => filterByArchiveScope(notes, archiveScope),
    [notes, archiveScope],
  )

  const rows = useMemo(() => scopedNotes.map(note => {
    const appt = note.appointment_id ? appointmentsById.get(note.appointment_id) : null
    const status = progressNoteHistoryStatusLabel(note)
    const when = formatDisplayDate(note.session_date)
    const appointmentLabel = appt ? formatSessionDateTime(appt) : ''
    const archived = Boolean(note.archived_at)
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
        actions: (
          <span className="practice-docs__actions">
            {archived ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    onArchive(note)
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(note)
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={(event) => {
                  event.stopPropagation()
                  onArchive(note)
                }}
              >
                Archive
              </button>
            )}
          </span>
        ),
      },
    }
  }), [scopedNotes, appointmentsById])

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
      toolbar={<ArchiveScopeToggle value={archiveScope} onChange={setArchiveScope} />}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load Process Notes.'}</p>}
      {!error && (
        <RecordTable
          remember={`notes-${clientId}`}
          columns={NOTE_COLUMNS}
          rows={rows}
          countNoun="notes"
          defaultSort={{ key: 'date', direction: 'desc' }}
          emptyMessage={isPending
            ? 'Loading notes…'
            : (archiveScope === 'archived' ? 'No archived Process Notes.' : 'No Process Notes recorded yet.')}
          onRowClick={openNote}
        />
      )}
    </RecordListLayout>
  )
}
