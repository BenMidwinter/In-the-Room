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
import { useAuth } from '../../lib/auth/AuthProvider'
import { useLetterheadDownload } from '../../hooks/useLetterheadDownload'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { hoursFromMinutes } from '../../lib/practiceLogs'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
} from '../../lib/recordStatus'
import {
  useDeletePracticeLogMutation,
  usePracticeLogsQuery,
  useSavePracticeLogMutation,
  useSetPracticeLogStatusMutation,
} from '../../lib/practiceLogQueries'
import { getProfile } from '../../lib/store'
import DocumentWorkspace from '../client/DocumentWorkspace'

const COPY = {
  cpd: {
    title: 'CPD log',
    newLabel: 'CPD entry',
    noun: 'entries',
    labelName: 'Activity',
    placeholder: 'e.g. Trauma conference',
    empty: 'No CPD logged yet.',
  },
  supervision: {
    title: 'Supervision log',
    newLabel: 'supervision',
    noun: 'entries',
    labelName: 'With',
    placeholder: 'e.g. Peer group',
    empty: 'No supervision logged yet.',
  },
}

const DIRECTION_LABELS = {
  delivered: 'Delivered',
  received: 'Received',
}

function formatDate(iso) {
  if (!iso) return '—'
  const date = String(iso).slice(0, 10)
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatHours(minutes) {
  const hours = hoursFromMinutes(minutes)
  return Number.isInteger(hours) ? `${hours}` : String(hours)
}

export default function PracticeLogPage({ kind }) {
  const copy = COPY[kind]
  const toast = useToast()
  const { downloadDocument } = useLetterheadDownload()
  const confirm = useConfirm()
  const { setEditorOpen } = useOutletContext() || {}
  const { profile: accountProfile, user } = useAuth()
  const userId = user?.id || ''
  const { data: entries = [], isPending, error } = usePracticeLogsQuery(kind, userId)
  const saveEntry = useSavePracticeLogMutation(kind, userId)
  const removeEntry = useDeletePracticeLogMutation(kind, userId)
  const setLogStatus = useSetPracticeLogStatusMutation(kind, userId)
  const [statusFilter, setStatusFilter] = useState('Active')
  const { selectedIds, selection, clear: clearSelection, count: selectedCount } = useRowSelection()
  const [openId, setOpenId] = useState(null)
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('1')
  const [label, setLabel] = useState('')
  const [direction, setDirection] = useState('received')
  const [content, setContent] = useState('<p></p>')
  const [editorVersion, setEditorVersion] = useState(0)

  const clinicianProfile = useMemo(
    () => clinicianProfileForEditor(accountProfile, user ? getProfile(user.id) : null),
    [accountProfile, user],
  )
  const mergeContext = useMemo(
    () => buildMergeContext({ profile: clinicianProfile }),
    [clinicianProfile],
  )

  const close = () => {
    setEditorOpen?.(false)
    setOpenId(null)
  }

  const openNew = () => {
    setOpenId('new')
    setOccurredOn(new Date().toISOString().slice(0, 10))
    setHours('1')
    setLabel('')
    setDirection('received')
    setContent('<p></p>')
    setEditorVersion((value) => value + 1)
    setEditorOpen?.(true)
  }

  const openExisting = (entry) => {
    setOpenId(entry.id)
    setOccurredOn(entry.occurred_on)
    setHours(formatHours(entry.minutes))
    setLabel(entry.label === 'CPD' || entry.label === 'Supervision' ? '' : entry.label)
    setDirection(entry.direction || 'received')
    setContent(entry.content || '<p></p>')
    setEditorVersion((value) => value + 1)
    setEditorOpen?.(true)
  }

  const save = async () => {
    try {
      const saved = await saveEntry.mutateAsync({
        id: openId,
        occurredOn,
        hours,
        label,
        direction: kind === 'supervision' ? direction : null,
        content,
      })
      setOpenId(saved.id)
      setLabel(saved.label === 'CPD' || saved.label === 'Supervision' ? '' : saved.label)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not save this entry')
    }
  }

  const moveStatus = async (entry, nextStatus, toastLabel) => {
    try {
      await setLogStatus.mutateAsync({ id: entry.id, status: nextStatus })
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
      const metaHtml = `<p>${formatDate(entry.occurred_on)} · ${formatHours(entry.minutes)} hours</p>`
      const opened = await downloadDocument({
        title: entry.label || copy.title,
        bodyHtml: entry.content,
        metaHtml,
        mergeContext,
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

  const columns = kind === 'supervision'
    ? [
      { key: 'date', label: 'Date', sort: 'date' },
      { key: 'direction', label: 'Type', filter: 'choice', sort: 'text' },
      { key: 'label', label: 'With', filter: 'text', sort: 'text' },
      { key: 'hours', label: 'Hours', sort: 'number' },
      STATUS_COLUMN,
      { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
    ]
    : [
      { key: 'date', label: 'Date', sort: 'date' },
      { key: 'label', label: 'Activity', filter: 'text', sort: 'text' },
      { key: 'hours', label: 'Hours', sort: 'number' },
      STATUS_COLUMN,
      { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
    ]

  const rows = entries.map((entry) => {
    const type = DIRECTION_LABELS[entry.direction] || ''
    const hoursLabel = formatHours(entry.minutes)
    const status = recordStatusOf(entry)
    const readOnly = status !== 'active'
    return {
      id: entry.id,
      entry,
      filterValues: {
        label: entry.label,
        direction: type,
        state: statusLabelOf(entry),
      },
      sortValues: {
        date: entry.occurred_on,
        direction: type,
        label: entry.label,
        hours: entry.minutes,
        state: statusLabelOf(entry),
      },
      muted: readOnly,
      cells: {
        date: formatDate(entry.occurred_on),
        direction: type,
        label: <span className="record-table__primary">{entry.label}</span>,
        hours: hoursLabel,
        state: <StatusBadge status={status} />,
        actions: (
          <RowMenu
            label={`Actions for ${entry.label}`}
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
        title={label.trim() || copy.title}
        onBack={close}
        actions={(
          <>
            {openId !== 'new' && openEntry && openStatus === 'archive' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openEntry, 'active', 'Entry restored')} disabled={setLogStatus.isPending}>Restore</button>
            )}
            {openId !== 'new' && openEntry && openStatus === 'trash' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openEntry, 'archive', 'Entry restored to archive')} disabled={setLogStatus.isPending}>Restore to archive</button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => downloadOne({
                label: label.trim() || copy.title,
                occurred_on: occurredOn,
                minutes: Math.round(parseFloat(hours || '0') * 60),
                content,
              })}
            >
              Download
            </button>
            {!openReadOnly && (
              <button type="button" className="primary" onClick={save} disabled={saveEntry.isPending}>
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
                value={occurredOn}
                onChange={(event) => setOccurredOn(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Hours</span>
              <input
                type="number"
                min="0"
                max="1000"
                step="0.25"
                className="progress-notes-page__meta-input"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            {kind === 'supervision' && (
              <label className="progress-notes-page__meta-field">
                <span className="progress-notes-page__meta-label">Type</span>
                <select
                  className="progress-notes-page__meta-input"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
                  disabled={openReadOnly}
                >
                  <option value="received">Received</option>
                  <option value="delivered">Delivered</option>
                </select>
              </label>
            )}
            <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
              <span className="progress-notes-page__meta-label">{copy.labelName}</span>
              <input
                className="progress-notes-page__meta-input"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={copy.placeholder}
                disabled={openReadOnly}
              />
            </label>
          </>
        )}
      >
        <RichTextEditor
          key={`${openId}-${editorVersion}`}
          content={content}
          onChange={setContent}
          layout="immersive"
          variant="a4"
          mode="clinical"
          mergeMode="document"
          mergeContext={mergeContext}
          clinicianProfile={clinicianProfile}
          editable={!openReadOnly}
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      title={copy.title}
      newLabel={copy.newLabel}
      onNew={openNew}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load this log.'}</p>}
      <BulkStatusBar
        count={selectedCount}
        noun={copy.noun}
        actions={bulk}
        onClear={clearSelection}
      />
      {!error && (
        <RecordTable
          remember={`practice-${kind}-status`}
          columns={columns}
          rows={rows}
          countNoun={copy.noun}
          defaultSort={{ key: 'date', direction: 'desc' }}
          defaultFilters={STATUS_DEFAULT_FILTERS}
          selection={selection}
          emptyMessage={isPending ? 'Loading…' : copy.empty}
          onRowClick={(row) => openExisting(row.entry)}
          onFiltersChange={(next) => {
            const status = String(next?.state || 'Active')
            if (status !== statusFilter) setStatusFilter(status)
          }}
        />
      )}
    </RecordListLayout>
  )
}
