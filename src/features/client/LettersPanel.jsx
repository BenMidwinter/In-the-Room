import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import BulkStatusBar from '../../components/BulkStatusBar'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import RowMenu from '../../components/RowMenu'
import StatusBadge from '../../components/StatusBadge'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useConfirm, useToast } from '../../components/ui'
import { useRowSelection } from '../../hooks/useRowSelection'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useLetterheadDownload } from '../../hooks/useLetterheadDownload'
import { preferredLetterhead, printLetterheadFromRow } from '../../lib/letterheadPrint'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
} from '../../lib/recordStatus'
import { getProfile } from '../../lib/store'
import {
  deleteLetter,
  listLettersForClient,
  saveLetterForUser,
  setLetterStatus,
} from '../../lib/supabase/lettersRepo'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import { useTemplatesQuery } from '../../lib/templateQueries'
import { useClientSession } from '../../lib/useClientSession'
import { useClientChrome } from './ClientChrome'
import DocumentWorkspace from './DocumentWorkspace'
import LetterheadPreview from './LetterheadPreview'

function formatDocDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const LETTER_COLUMNS = [
  { key: 'title', label: 'Title', filter: 'text' },
  { key: 'recipient', label: 'Recipient', filter: 'text' },
  { key: 'date', label: 'Letter date', sort: 'date' },
  { key: 'updated', label: 'Updated', sort: 'date' },
  STATUS_COLUMN,
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function LettersPanel({ embedded = false }) {
  const { clientId, session, client } = useClientSession()
  const { data: letters = [], refetch, isPending, error } = useQuery({
    queryKey: ['letters', clientId],
    queryFn: () => listLettersForClient(clientId),
  })
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('Active')
  const [seenClientId, setSeenClientId] = useState(clientId)
  if (seenClientId !== clientId) {
    setSeenClientId(clientId)
    setSelectedId(null)
  }
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [recipient, setRecipient] = useState('')
  const [letterDate, setLetterDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const toast = useToast()
  const { downloadLetter } = useLetterheadDownload()
  const confirm = useConfirm()
  const { selectedIds, selection, clear: clearSelection, count: selectedCount } = useRowSelection()
  const { profile: accountProfile } = useAuth()
  const { data: letterheads = [] } = useQuery({
    queryKey: ['letterheads'],
    queryFn: listLetterheads,
  })
  const [letterheadId, setLetterheadId] = useState(null)
  const { data: letterTemplates = [] } = useTemplatesQuery('letter')
  const clinicianProfile = useMemo(
    () => clinicianProfileForEditor(accountProfile, session?.user?.id ? getProfile(session.user.id) : null),
    [accountProfile, session?.user?.id],
  )
  const mergeContext = useMemo(
    () => buildMergeContext({
      client,
      appointment: null,
      profile: clinicianProfile,
      sessionDate: letterDate,
    }),
    [client, clinicianProfile, letterDate],
  )
  const letterheadRow = letterheads.find((row) => row.id === letterheadId) || preferredLetterhead(letterheads)
  const printLetterhead = useMemo(
    () => printLetterheadFromRow(letterheadRow, {
      clinicianName: clinicianProfile.full_name || '',
      professionalTitle: clinicianProfile.professional_title || '',
    }),
    [letterheadRow, clinicianProfile],
  )
  const setEditorOpen = useClientChrome()?.setEditorOpen

  useEffect(() => {
    if (!setEditorOpen) return undefined
    setEditorOpen(selectedId != null)
    return () => setEditorOpen(false)
  }, [selectedId, setEditorOpen])

  const refresh = () => refetch()

  const handleCancel = () => setSelectedId(null)

  const selectLetter = (letter) => {
    setSelectedId(letter.id)
    setTitle(letter.title)
    setContent(letter.content)
    setRecipient(letter.recipient || '')
    setLetterDate(letter.letter_date || todayISO())
  }

  const applyLetterTemplate = async (templateId) => {
    if (!templateId) return
    const template = letterTemplates.find((item) => item.id === templateId)
    if (!template) return
    if (hasMeaningfulEditorContent(content)) {
      const ok = await confirm({
        title: 'Replace letter content?',
        message: 'This replaces the current letter with the selected template.',
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setContent(template.content || '<p></p>')
    if (!title.trim() || title === 'Untitled letter') setTitle(template.name)
    setEditorVersion((value) => value + 1)
  }

  const handleNew = () => {
    setSelectedId('new')
    setTitle('Untitled letter')
    setContent('<p></p>')
    setRecipient('')
    setLetterDate(todayISO())
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please add a letter title.')
      return
    }
    if (!session?.user?.id) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveLetterForUser({
        id: selectedId === 'new' ? undefined : selectedId,
        client_id: clientId,
        title: title.trim(),
        content,
        recipient,
        letter_date: letterDate,
      }, session.user.id)
      await refresh()
      setSelectedId(saved.id)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'The letter could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const moveStatus = async (letter, nextStatus, toastLabel) => {
    try {
      await setLetterStatus(letter.id, nextStatus)
      if (selectedId === letter.id && nextStatus !== 'active') setSelectedId(null)
      await refresh()
      clearSelection()
      toast.saved(toastLabel)
    } catch (err) {
      toast.error(err?.message || 'Could not update this letter')
    }
  }

  const permanentlyDelete = async (letter) => {
    const ok = await confirm({
      title: 'Permanently delete this letter?',
      message: 'This cannot be undone.',
      confirmLabel: 'Permanently delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteLetter(letter.id)
      if (selectedId === letter.id) setSelectedId(null)
      await refresh()
      clearSelection()
      toast.saved('Letter permanently deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this letter')
    }
  }

  const downloadOne = async (letter) => {
    try {
      const opened = await downloadLetter(letter, {
        clientName: client?.real_name,
        mergeContext: buildMergeContext({
          client,
          appointment: null,
          profile: clinicianProfile,
          sessionDate: letter.letter_date,
        }),
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

  const handleDownload = async () => {
    await downloadOne({
      title: title.trim() || 'Untitled letter',
      content,
      recipient,
      letter_date: letterDate,
    })
  }

  const runBulk = async (action) => {
    const targets = letters.filter((letter) => selectedIds.includes(letter.id))
    if (!targets.length) return
    for (const letter of targets) {
      // Sequential to keep toast noise down and respect rate limits.
      // eslint-disable-next-line no-await-in-loop
      await action(letter)
    }
  }

  const bulk = bulkActionsForStatus(statusFilter, {
    onArchive: () => runBulk((letter) => moveStatus(letter, 'archive', 'Letters archived')),
    onRestore: () => runBulk((letter) => moveStatus(letter, 'active', 'Letters restored')),
    onDelete: () => runBulk((letter) => moveStatus(letter, 'trash', 'Letters moved to trash')),
    onRestoreToArchive: () => runBulk((letter) => moveStatus(letter, 'archive', 'Letters restored to archive')),
    onPermanentDelete: async () => {
      const ok = await confirm({
        title: 'Permanently delete selected letters?',
        message: 'This cannot be undone.',
        confirmLabel: 'Permanently delete',
        tone: 'danger',
      })
      if (!ok) return
      await runBulk(async (letter) => {
        await deleteLetter(letter.id)
      })
      await refresh()
      clearSelection()
      toast.saved('Letters permanently deleted')
    },
    onDownload: () => runBulk((letter) => downloadOne(letter)),
  })

  const rows = letters.map((letter) => {
    const status = recordStatusOf(letter)
    const readOnly = status !== 'active'
    return {
      id: letter.id,
      letter,
      filterValues: {
        title: letter.title,
        recipient: letter.recipient || '',
        date: formatDocDate(letter.letter_date),
        state: statusLabelOf(letter),
      },
      sortValues: {
        title: letter.title,
        recipient: letter.recipient || '',
        date: letter.letter_date || '',
        updated: letter.updated_at || '',
        state: statusLabelOf(letter),
      },
      muted: readOnly,
      cells: {
        title: <span className="record-table__primary">{letter.title}</span>,
        recipient: letter.recipient || <span className="record-table__cell-muted">—</span>,
        date: formatDocDate(letter.letter_date),
        updated: formatDocDate(letter.updated_at),
        state: <StatusBadge status={status} />,
        actions: (
          <RowMenu
            label={`Actions for ${letter.title}`}
            items={statusMenuItems(status, {
              onEdit: () => selectLetter(letter),
              onView: () => selectLetter(letter),
              onArchive: () => moveStatus(letter, 'archive', 'Letter archived'),
              onRestore: () => moveStatus(letter, 'active', 'Letter restored'),
              onDelete: () => moveStatus(letter, 'trash', 'Letter moved to trash'),
              onRestoreToArchive: () => moveStatus(letter, 'archive', 'Letter restored to archive'),
              onPermanentDelete: () => permanentlyDelete(letter),
              onDownload: () => downloadOne(letter),
            })}
          />
        ),
      },
    }
  })

  const editing = selectedId != null
  const editorTitle = selectedId === 'new' ? 'New letter' : title || 'Letter'
  const openLetter = letters.find((row) => row.id === selectedId)
  const openStatus = openLetter ? recordStatusOf(openLetter) : 'active'
  const openReadOnly = selectedId !== 'new' && openStatus !== 'active'

  if (editing) {
    return (
      <DocumentWorkspace
        letter
        title={editorTitle}
        clientName={client?.real_name}
        onBack={handleCancel}
        actions={!openReadOnly ? (
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save letter'}
          </button>
        ) : null}
        inspectorExtras={(
          <>
            {selectedId !== 'new' && openLetter && openStatus === 'archive' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openLetter, 'active', 'Letter restored')}>Restore</button>
            )}
            {selectedId !== 'new' && openLetter && openStatus === 'trash' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openLetter, 'archive', 'Letter restored to archive')}>Restore to archive</button>
            )}
            <button type="button" className="secondary" onClick={handleDownload}>Download</button>
          </>
        )}
        meta={(
          <>
            <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
              <span className="progress-notes-page__meta-label">Title</span>
              <input
                className="progress-notes-page__meta-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Recipient</span>
              <input
                className="progress-notes-page__meta-input"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="e.g. Dr Smith"
                disabled={openReadOnly}
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Letter date</span>
              <input
                type="date"
                className="progress-notes-page__meta-input"
                value={letterDate}
                onChange={(event) => setLetterDate(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            {!openReadOnly && (
              <label className="progress-notes-page__meta-field progress-notes-page__meta-field--template">
                <span className="progress-notes-page__meta-label">Template</span>
                <select
                  className="progress-notes-page__meta-input"
                  value=""
                  onChange={(event) => applyLetterTemplate(event.target.value)}
                >
                  <option value="">Choose a template…</option>
                  {letterTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
            )}
            {letterheads.length > 1 && (
              <label className="progress-notes-page__meta-field">
                <span className="progress-notes-page__meta-label">Letterhead</span>
                <select
                  className="progress-notes-page__meta-input"
                  value={letterheadRow?.id || ''}
                  onChange={(event) => setLetterheadId(event.target.value)}
                >
                  {letterheads.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.practice_name || row.name || 'Letterhead'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      >
        <RichTextEditor
          key={`${selectedId}-${editorVersion}`}
          content={content}
          onChange={setContent}
          layout="immersive"
          variant="a4"
          mode="clinical"
          mergeContext={mergeContext}
          clinicianProfile={clinicianProfile}
          pageHeader={<LetterheadPreview letterhead={printLetterhead} />}
          editable={!openReadOnly}
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      embedded={embedded}
      title={embedded ? '' : 'Letters'}
      newLabel="letter"
      onNew={handleNew}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load letters.'}</p>}
      <BulkStatusBar
        count={selectedCount}
        noun="letters"
        actions={bulk}
        onClear={clearSelection}
      />
      {!editing && !error && (
        <RecordTable
          remember={`letters-status-${clientId}`}
          columns={LETTER_COLUMNS}
          rows={rows}
          countNoun="letters"
          defaultSort={{ key: 'updated', direction: 'desc' }}
          defaultFilters={STATUS_DEFAULT_FILTERS}
          selection={selection}
          emptyMessage={isPending ? 'Loading letters…' : 'No letters yet.'}
          onRowClick={(row) => selectLetter(row.letter)}
          onFiltersChange={(next) => {
            const status = String(next?.state || 'Active')
            if (status !== statusFilter) setStatusFilter(status)
          }}
        />
      )}
    </RecordListLayout>
  )
}
