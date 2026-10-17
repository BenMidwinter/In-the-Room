import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import BulkStatusBar from '../../components/BulkStatusBar'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import RowMenu from '../../components/RowMenu'
import StatusBadge from '../../components/StatusBadge'
import { useConfirm, useToast } from '../../components/ui'
import { useRowSelection } from '../../hooks/useRowSelection'
import { downloadRichDocumentPdf } from '../../lib/clinicalExport'
import { useAppSession } from '../../lib/AppSessionContext'
import { DEMO_TODAY } from '../../lib/dateArchitecture'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
} from '../../lib/recordStatus'
import {
  useDeleteJournalEntryMutation,
  useJournalEntriesQuery,
  useSaveJournalEntryMutation,
  useSetJournalEntryStatusMutation,
} from '../../lib/journalQueries'
import DocumentWorkspace from '../client/DocumentWorkspace'

const SOMATIC_TAGS = ['Grounded', 'Activated', 'Fatigued', 'Open', 'Constricted', 'Settled']

function defaultJournalTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatJournalDate(date) {
  if (!date) return '—'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function sortJournalEntries(items) {
  return [...items].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return String(b.time || '').localeCompare(String(a.time || ''))
  })
}

const COLUMNS = [
  { key: 'date', label: 'Date', sort: 'date' },
  { key: 'time', label: 'Time', sort: 'text' },
  { key: 'somatic', label: 'Somatic state', filter: 'choice', sort: 'text' },
  { key: 'preview', label: 'Preview', filter: 'text' },
  STATUS_COLUMN,
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function ClinicianJournal() {
  const { session } = useAppSession()
  const userId = session?.user?.id ?? ''
  const toast = useToast()
  const confirm = useConfirm()
  const { setEditorOpen } = useOutletContext() || {}
  const { data: entries = [], isPending, error } = useJournalEntriesQuery(userId)
  const saveEntry = useSaveJournalEntryMutation(userId)
  const removeEntry = useDeleteJournalEntryMutation(userId)
  const setEntryStatus = useSetJournalEntryStatusMutation(userId)
  const [statusFilter, setStatusFilter] = useState('Active')
  const { selectedIds, selection, clear: clearSelection, count: selectedCount } = useRowSelection()
  const sortedEntries = useMemo(() => sortJournalEntries(entries), [entries])

  const [openId, setOpenId] = useState(null)
  const [draftDate, setDraftDate] = useState(DEMO_TODAY)
  const [draftTime, setDraftTime] = useState(defaultJournalTime)
  const [draftSomatic, setDraftSomatic] = useState('Grounded')
  const [draftBody, setDraftBody] = useState('<p></p>')
  const [editorVersion, setEditorVersion] = useState(0)

  if (!session?.user) {
    return <p className="text-muted">Journal session unavailable. Return to Home and try again.</p>
  }

  const close = () => {
    setEditorOpen?.(false)
    setOpenId(null)
  }

  const openNew = () => {
    setOpenId('new')
    setDraftDate(DEMO_TODAY)
    setDraftTime(defaultJournalTime())
    setDraftSomatic('Grounded')
    setDraftBody('<p></p>')
    setEditorVersion((value) => value + 1)
    setEditorOpen?.(true)
  }

  const openExisting = (entry) => {
    setOpenId(entry.id)
    setDraftDate(entry.date)
    setDraftTime(entry.time || '09:00')
    setDraftSomatic(entry.somatic_state || 'Grounded')
    setDraftBody(entry.body_text || '<p></p>')
    setEditorVersion((value) => value + 1)
    setEditorOpen?.(true)
  }

  const handleSave = async () => {
    try {
      const saved = await saveEntry.mutateAsync({
        id: openId === 'new' ? undefined : openId,
        date: draftDate,
        time: draftTime,
        somatic_state: draftSomatic,
        body_text: draftBody,
      })
      setOpenId(saved.id)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not save the journal entry.')
    }
  }

  const moveStatus = async (entry, nextStatus, toastLabel) => {
    try {
      await setEntryStatus.mutateAsync({ id: entry.id, status: nextStatus })
      if (openId === entry.id && nextStatus !== 'active') close()
      clearSelection()
      toast.saved(toastLabel)
    } catch (err) {
      toast.error(err?.message || 'Could not update this entry')
    }
  }

  const permanentlyDelete = async (entryId) => {
    const ok = await confirm({
      title: 'Permanently delete this entry?',
      message: 'This cannot be undone.',
      confirmLabel: 'Permanently delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeEntry.mutateAsync(entryId)
      if (openId === entryId) close()
      clearSelection()
      toast.saved('Entry permanently deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this entry')
    }
  }

  const downloadOne = async (entry) => {
    try {
      const title = `Journal ${formatJournalDate(entry.date)}`
      const metaHtml = `<p>${entry.time || ''} · ${entry.somatic_state || ''}</p>`
      const opened = await downloadRichDocumentPdf({
        title,
        bodyHtml: entry.body_text,
        metaHtml,
      })
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
    const targets = entries.filter((entry) => selectedIds.includes(entry.id))
    if (!targets.length) return
    for (const entry of targets) {
      // eslint-disable-next-line no-await-in-loop
      await action(entry)
    }
  }

  const bulk = bulkActionsForStatus(statusFilter, {
    onArchive: () => runBulk((entry) => moveStatus(entry, 'archive', 'Entries archived')),
    onRestore: () => runBulk((entry) => moveStatus(entry, 'active', 'Entries restored')),
    onDelete: () => runBulk((entry) => moveStatus(entry, 'trash', 'Entries moved to trash')),
    onRestoreToArchive: () => runBulk((entry) => moveStatus(entry, 'archive', 'Entries restored to archive')),
    onPermanentDelete: async () => {
      const ok = await confirm({
        title: 'Permanently delete selected entries?',
        message: 'This cannot be undone.',
        confirmLabel: 'Permanently delete',
        tone: 'danger',
      })
      if (!ok) return
      await runBulk(async (entry) => {
        await removeEntry.mutateAsync(entry.id)
      })
      clearSelection()
      toast.saved('Entries permanently deleted')
    },
    onDownload: () => runBulk((entry) => downloadOne(entry)),
  })

  const rows = sortedEntries.map((entry) => {
    const preview = stripHtml(entry.body_text).slice(0, 90) || 'Empty entry'
    const status = recordStatusOf(entry)
    const readOnly = status !== 'active'
    return {
      id: entry.id,
      entry,
      filterValues: {
        somatic: entry.somatic_state || '',
        preview,
        status: statusLabelOf(entry),
      },
      sortValues: {
        date: entry.date,
        time: entry.time || '',
        somatic: entry.somatic_state || '',
        preview,
        status: statusLabelOf(entry),
      },
      muted: readOnly,
      cells: {
        date: formatJournalDate(entry.date),
        time: entry.time || '—',
        somatic: (
          <span className="badge badge-grey" data-somatic={(entry.somatic_state || '').toLowerCase()}>
            {entry.somatic_state || '—'}
          </span>
        ),
        preview: <span className="record-table__primary">{preview}</span>,
        status: <StatusBadge status={status} />,
        actions: (
          <RowMenu
            label="Journal entry actions"
            items={statusMenuItems(status, {
              onEdit: () => openExisting(entry),
              onView: () => openExisting(entry),
              onArchive: () => moveStatus(entry, 'archive', 'Entry archived'),
              onRestore: () => moveStatus(entry, 'active', 'Entry restored'),
              onDelete: () => moveStatus(entry, 'trash', 'Entry moved to trash'),
              onRestoreToArchive: () => moveStatus(entry, 'archive', 'Entry restored to archive'),
              onPermanentDelete: () => permanentlyDelete(entry.id),
              onDownload: () => downloadOne(entry),
            })}
          />
        ),
      },
    }
  })

  const openEntry = entries.find((entry) => entry.id === openId)
  const openStatus = openEntry ? recordStatusOf(openEntry) : 'active'
  const openReadOnly = openId !== 'new' && openStatus !== 'active'

  if (openId) {
    return (
      <DocumentWorkspace
        title="Journal entry"
        onBack={close}
        actions={(
          <>
            {openId !== 'new' && openEntry && openStatus === 'archive' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openEntry, 'active', 'Entry restored')} disabled={setEntryStatus.isPending}>Restore</button>
            )}
            {openId !== 'new' && openEntry && openStatus === 'trash' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openEntry, 'archive', 'Entry restored to archive')} disabled={setEntryStatus.isPending}>Restore to archive</button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => downloadOne({
                date: draftDate,
                time: draftTime,
                somatic_state: draftSomatic,
                body_text: draftBody,
              })}
            >
              Download
            </button>
            {!openReadOnly && (
              <button type="button" className="primary" onClick={handleSave} disabled={saveEntry.isPending}>
                {saveEntry.isPending ? 'Saving…' : 'Save'}
              </button>
            )}
          </>
        )}
        meta={(
          <>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Date</span>
              <input
                type="date"
                className="progress-notes-page__meta-input"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Time</span>
              <input
                type="time"
                className="progress-notes-page__meta-input"
                value={draftTime}
                onChange={(event) => setDraftTime(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Somatic state</span>
              <select
                className="progress-notes-page__meta-input"
                data-somatic={draftSomatic.toLowerCase()}
                value={draftSomatic}
                onChange={(event) => setDraftSomatic(event.target.value)}
                disabled={openReadOnly}
              >
                {SOMATIC_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </label>
          </>
        )}
      >
        <RichTextEditor
          key={`${openId}-${editorVersion}`}
          content={draftBody}
          onChange={setDraftBody}
          layout="immersive"
          variant="a4"
          mode="clinical"
          editable={!openReadOnly}
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      title="Journal"
      newLabel="entry"
      onNew={openNew}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load journal entries.'}</p>}
      <BulkStatusBar
        count={selectedCount}
        noun="entries"
        actions={bulk}
        onClear={clearSelection}
      />
      {!error && (
        <RecordTable
          remember="practice-journal-status"
          columns={COLUMNS}
          rows={rows}
          countNoun="entries"
          defaultSort={{ key: 'date', direction: 'desc' }}
          defaultFilters={STATUS_DEFAULT_FILTERS}
          selection={selection}
          emptyMessage={isPending ? 'Loading…' : 'No journal entries yet.'}
          onRowClick={(row) => openExisting(row.entry)}
          onFiltersChange={(next) => {
            const status = String(next?.status || 'Active')
            if (status !== statusFilter) setStatusFilter(status)
          }}
        />
      )}
    </RecordListLayout>
  )
}
