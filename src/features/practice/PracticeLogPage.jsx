import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import ArchiveScopeToggle from '../../components/ArchiveScopeToggle'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import { useConfirm, useToast } from '../../components/ui'
import { filterByArchiveScope } from '../../lib/archiveScope'
import { useAuth } from '../../lib/auth/AuthProvider'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { hoursFromMinutes } from '../../lib/practiceLogs'
import {
  useArchivePracticeLogMutation,
  useDeletePracticeLogMutation,
  usePracticeLogsQuery,
  useSavePracticeLogMutation,
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
    emptyArchived: 'No archived CPD entries.',
  },
  supervision: {
    title: 'Supervision log',
    newLabel: 'supervision',
    noun: 'entries',
    labelName: 'With',
    placeholder: 'e.g. Peer group',
    empty: 'No supervision logged yet.',
    emptyArchived: 'No archived supervision entries.',
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
  const confirm = useConfirm()
  const { setEditorOpen } = useOutletContext() || {}
  const { profile: accountProfile, user } = useAuth()
  const userId = user?.id || ''
  const { data: entries = [], isPending, error } = usePracticeLogsQuery(kind, userId)
  const saveEntry = useSavePracticeLogMutation(kind, userId)
  const removeEntry = useDeletePracticeLogMutation(kind, userId)
  const archiveEntry = useArchivePracticeLogMutation(kind, userId)
  const [archiveScope, setArchiveScope] = useState('active')
  const [openId, setOpenId] = useState(null)
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('1')
  const [label, setLabel] = useState('')
  const [direction, setDirection] = useState('received')
  const [content, setContent] = useState('<p></p>')
  const [editorVersion, setEditorVersion] = useState(0)

  const visibleEntries = useMemo(
    () => filterByArchiveScope(entries, archiveScope),
    [entries, archiveScope],
  )

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

  const remove = async (entryId = openId) => {
    if (!entryId || entryId === 'new') {
      close()
      return
    }
    const ok = await confirm({
      title: 'Delete this entry?',
      message: 'This permanently removes it from your log.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeEntry.mutateAsync(entryId)
      if (openId === entryId) close()
      toast.saved('Entry deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this entry')
    }
  }

  const handleArchive = async (entry) => {
    try {
      await archiveEntry.mutateAsync({ id: entry.id, archived: !entry.archived_at })
      if (openId === entry.id && !entry.archived_at) close()
      toast.saved(entry.archived_at ? 'Entry restored' : 'Entry archived')
    } catch (err) {
      toast.error(err?.message || 'Could not update this entry')
    }
  }

  const columns = kind === 'supervision'
    ? [
      { key: 'date', label: 'Date', sort: 'date' },
      { key: 'direction', label: 'Type', filter: 'choice', sort: 'text' },
      { key: 'label', label: 'With', filter: 'text', sort: 'text' },
      { key: 'hours', label: 'Hours', sort: 'number' },
      { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
    ]
    : [
      { key: 'date', label: 'Date', sort: 'date' },
      { key: 'label', label: 'Activity', filter: 'text', sort: 'text' },
      { key: 'hours', label: 'Hours', sort: 'number' },
      { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
    ]

  const rows = visibleEntries.map((entry) => {
    const type = DIRECTION_LABELS[entry.direction] || ''
    const hoursLabel = formatHours(entry.minutes)
    const archived = Boolean(entry.archived_at)
    return {
      id: entry.id,
      entry,
      filterValues: {
        label: entry.label,
        direction: type,
      },
      sortValues: {
        date: entry.occurred_on,
        direction: type,
        label: entry.label,
        hours: entry.minutes,
      },
      cells: {
        date: formatDate(entry.occurred_on),
        direction: type,
        label: <span className="record-table__primary">{entry.label}</span>,
        hours: hoursLabel,
        actions: (
          <span className="practice-docs__actions">
            {archived ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleArchive(entry)
                  }}
                  disabled={archiveEntry.isPending}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    remove(entry.id)
                  }}
                  disabled={removeEntry.isPending}
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
                  handleArchive(entry)
                }}
                disabled={archiveEntry.isPending}
              >
                Archive
              </button>
            )}
          </span>
        ),
      },
    }
  })

  const openEntry = entries.find((entry) => entry.id === openId)
  const openArchived = Boolean(openEntry?.archived_at)

  if (openId) {
    return (
      <DocumentWorkspace
        title={label.trim() || copy.title}
        onBack={close}
        actions={(
          <>
            {openId !== 'new' && (
              openArchived ? (
                <>
                  <button type="button" className="secondary" onClick={() => openEntry && handleArchive(openEntry)} disabled={archiveEntry.isPending || !openEntry}>Restore</button>
                  <button type="button" className="danger" onClick={() => remove(openId)} disabled={removeEntry.isPending}>Delete</button>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => openEntry && handleArchive(openEntry)} disabled={archiveEntry.isPending || !openEntry}>Archive</button>
              )
            )}
            <button type="button" className="primary" onClick={save} disabled={saveEntry.isPending}>
              {saveEntry.isPending ? 'Saving…' : 'Save'}
            </button>
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
              />
            </label>
            {kind === 'supervision' && (
              <label className="progress-notes-page__meta-field">
                <span className="progress-notes-page__meta-label">Type</span>
                <select
                  className="progress-notes-page__meta-input"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
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
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      title={copy.title}
      newLabel={archiveScope === 'active' ? copy.newLabel : undefined}
      onNew={archiveScope === 'active' ? openNew : undefined}
      toolbar={<ArchiveScopeToggle value={archiveScope} onChange={setArchiveScope} />}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load this log.'}</p>}
      {!error && (
        <RecordTable
          remember={`practice-${kind}`}
          columns={columns}
          rows={rows}
          countNoun={copy.noun}
          defaultSort={{ key: 'date', direction: 'desc' }}
          emptyMessage={isPending
            ? 'Loading…'
            : (archiveScope === 'archived' ? copy.emptyArchived : copy.empty)}
          onRowClick={(row) => openExisting(row.entry)}
        />
      )}
    </RecordListLayout>
  )
}
