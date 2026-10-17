import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BulkStatusBar from '../../components/BulkStatusBar'
import RowMenu from '../../components/RowMenu'
import StatusBadge from '../../components/StatusBadge'
import { useClientSession } from '../../lib/useClientSession'
import { downloadProgressNotePdf } from '../../lib/clinicalExport'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
} from '../../lib/recordStatus'
import {
  useDeleteProgressNoteMutation,
  useProgressNotesFeedQuery,
  useSetProgressNoteStatusMutation,
} from '../../lib/progressNoteQueries'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { formatDisplayDate } from '../../lib/dateArchitecture'
import { progressNoteHistoryStatusLabel } from '../../lib/progressNoteLifecycle'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { formatSessionDateTime } from '../../lib/appointmentUtils'
import { useConfirm, useToast } from '../../components/ui'
import { useRowSelection } from '../../hooks/useRowSelection'

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
  { key: 'noteStatus', label: 'Note status', filter: 'choice' },
  { key: 'template', label: 'Template', filter: 'choice' },
  { key: 'date', label: 'Date', filter: 'text', sort: 'date' },
  { key: 'appointment', label: 'Appointment', filter: 'text', sort: 'date' },
  STATUS_COLUMN,
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function NotesHistoryPanel() {
  const { clientId, client } = useClientSession()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [statusFilter, setStatusFilter] = useState('Active')
  const { data: notes = [], isPending, error } = useProgressNotesFeedQuery(clientId)
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)
  const removeNote = useDeleteProgressNoteMutation(clientId)
  const setNoteStatus = useSetProgressNoteStatusMutation(clientId)
  const { selectedIds, selection, clear: clearSelection, count: selectedCount } = useRowSelection()

  const appointmentsById = useMemo(() => {
    const map = new Map()
    for (const appt of appointments) map.set(appt.id, appt)
    return map
  }, [appointments])

  const moveStatus = async (note, nextStatus, toastLabel) => {
    try {
      await setNoteStatus.mutateAsync({ id: note.id, status: nextStatus })
      clearSelection()
      toast.saved(toastLabel)
    } catch (err) {
      toast.error(err?.message || 'Could not update this note')
    }
  }

  const permanentlyDelete = async (note) => {
    const ok = await confirm({
      title: 'Permanently delete this note?',
      message: 'This cannot be undone.',
      confirmLabel: 'Permanently delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeNote.mutateAsync(note.id)
      clearSelection()
      toast.saved('Note permanently deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this note')
    }
  }

  const downloadOne = async (note) => {
    try {
      const opened = await downloadProgressNotePdf(note, { clientName: client?.real_name })
      if (!opened) {
        toast.error('Could not create the PDF. Please try again.')
        return
      }
      toast.success('PDF downloaded.')
    } catch (err) {
      toast.error(err?.message || 'Could not prepare the PDF.')
    }
  }

  const runBulk = async (action) => {
    const targets = notes.filter((note) => selectedIds.includes(note.id))
    if (!targets.length) return
    for (const note of targets) {
      // eslint-disable-next-line no-await-in-loop
      await action(note)
    }
  }

  const bulk = bulkActionsForStatus(statusFilter, {
    onArchive: () => runBulk((note) => moveStatus(note, 'archive', 'Notes archived')),
    onRestore: () => runBulk((note) => moveStatus(note, 'active', 'Notes restored')),
    onDelete: () => runBulk((note) => moveStatus(note, 'trash', 'Notes moved to trash')),
    onRestoreToArchive: () => runBulk((note) => moveStatus(note, 'archive', 'Notes restored to archive')),
    onPermanentDelete: async () => {
      const ok = await confirm({
        title: 'Permanently delete selected notes?',
        message: 'This cannot be undone.',
        confirmLabel: 'Permanently delete',
        tone: 'danger',
      })
      if (!ok) return
      await runBulk(async (note) => {
        await removeNote.mutateAsync(note.id)
      })
      clearSelection()
      toast.saved('Notes permanently deleted')
    },
    onDownload: () => runBulk((note) => downloadOne(note)),
  })

  const openNote = (note) => {
    if (note.appointment_id) {
      navigate(`/clients/${clientId}/progress-notes?appointment=${note.appointment_id}`)
    } else {
      navigate(`/clients/${clientId}/progress-notes?note=${note.id}`)
    }
  }

  const rows = useMemo(() => notes.map(note => {
    const appt = note.appointment_id ? appointmentsById.get(note.appointment_id) : null
    const noteStatus = progressNoteHistoryStatusLabel(note)
    const lifecycle = recordStatusOf(note)
    const when = formatDisplayDate(note.session_date)
    const appointmentLabel = appt ? formatSessionDateTime(appt) : ''
    const readOnly = lifecycle !== 'active'
    return {
      id: note.id,
      note,
      filterValues: {
        noteStatus,
        title: note.title,
        template: note.template_name || '',
        date: when,
        appointment: appointmentLabel || 'None',
        status: statusLabelOf(note),
      },
      sortValues: {
        title: note.title,
        noteStatus,
        date: note.session_date || '',
        appointment: appt ? `${appt.session_date || ''}T${appt.start_time || ''}` : '',
        status: statusLabelOf(note),
      },
      muted: readOnly,
      cells: {
        title: <span className="record-table__primary">{note.title}</span>,
        noteStatus: <NoteStatusTag status={noteStatus} />,
        template: note.template_name || <span className="record-table__cell-muted">—</span>,
        date: when,
        appointment: appointmentLabel
          ? appointmentLabel
          : <span className="record-table__cell-muted">None</span>,
        status: <StatusBadge status={lifecycle} />,
        actions: (
          <RowMenu
            label={`Actions for ${note.title}`}
            items={statusMenuItems(lifecycle, {
              onEdit: () => openNote(note),
              onView: () => openNote(note),
              onArchive: () => moveStatus(note, 'archive', 'Note archived'),
              onRestore: () => moveStatus(note, 'active', 'Note restored'),
              onDelete: () => moveStatus(note, 'trash', 'Note moved to trash'),
              onRestoreToArchive: () => moveStatus(note, 'archive', 'Note restored to archive'),
              onPermanentDelete: () => permanentlyDelete(note),
              onDownload: () => downloadOne(note),
            })}
          />
        ),
      },
    }
  }), [notes, appointmentsById, clientId, navigate])

  return (
    <RecordListLayout title="Process Notes">
      {error && <p className="form-error" role="alert">{error.message || 'Could not load Process Notes.'}</p>}
      <BulkStatusBar
        count={selectedCount}
        noun="notes"
        actions={bulk}
        onClear={clearSelection}
      />
      {!error && (
        <RecordTable
          remember={`notes-status-${clientId}`}
          columns={NOTE_COLUMNS}
          rows={rows}
          countNoun="notes"
          defaultSort={{ key: 'date', direction: 'desc' }}
          defaultFilters={STATUS_DEFAULT_FILTERS}
          selection={selection}
          emptyMessage={isPending ? 'Loading notes…' : 'No Process Notes recorded yet.'}
          onRowClick={(row) => openNote(row.note)}
          onFiltersChange={(next) => {
            const status = String(next?.status || 'Active')
            if (status !== statusFilter) setStatusFilter(status)
          }}
        />
      )}
    </RecordListLayout>
  )
}
