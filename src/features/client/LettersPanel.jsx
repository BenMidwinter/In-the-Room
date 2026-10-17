import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ArchiveScopeToggle from '../../components/ArchiveScopeToggle'
import RichTextEditor from '../../components/RichTextEditor'
import { useClientSession } from '../../lib/useClientSession'
import { filterByArchiveScope } from '../../lib/archiveScope'
import { getProfile } from '../../lib/store'
import {
  deleteLetter,
  listLettersForClient,
  saveLetterForUser,
  setLetterArchived,
} from '../../lib/supabase/lettersRepo'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useTemplatesQuery } from '../../lib/templateQueries'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { downloadLetterPdf } from '../../lib/clinicalExport'
import { preferredLetterhead, printLetterheadFromRow } from '../../lib/letterheadPrint'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
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
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function LettersPanel({ embedded = false }) {
  const { clientId, session, client } = useClientSession()
  const { data: letters = [], refetch, isPending, error } = useQuery({
    queryKey: ['letters', clientId],
    queryFn: () => listLettersForClient(clientId),
  })
  const [archiveScope, setArchiveScope] = useState('active')
  const [selectedId, setSelectedId] = useState(null)
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
  const confirm = useConfirm()
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

  const handleArchive = async (letter) => {
    try {
      await setLetterArchived(letter.id, !letter.archived_at)
      await refresh()
      toast.saved(letter.archived_at ? 'Letter restored' : 'Letter archived')
    } catch (err) {
      toast.error(err?.message || 'Could not update this letter')
    }
  }

  const handleDelete = async (letter) => {
    const ok = await confirm({
      title: 'Delete this letter?',
      message: 'This permanently removes the letter.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteLetter(letter.id)
      if (selectedId === letter.id) setSelectedId(null)
      await refresh()
      toast.saved('Letter deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this letter')
    }
  }

  const handleDownload = async () => {
    try {
      const letterhead = printLetterhead
      const opened = await downloadLetterPdf(
        {
          title: title.trim() || 'Untitled letter',
          content,
          recipient,
          letter_date: letterDate,
        },
        {
          clientName: client?.real_name,
          letterhead,
          mergeContext,
        },
      )
      if (!opened) {
        toast.error('Could not create the PDF. Please try again.')
        return
      }
      toast.success('PDF downloaded.')
    } catch (err) {
      toast.error(err?.message || 'Could not prepare the letterhead.')
    }
  }

  const scopedLetters = useMemo(
    () => filterByArchiveScope(letters, archiveScope),
    [letters, archiveScope],
  )

  const rows = scopedLetters.map(letter => {
    const archived = Boolean(letter.archived_at)
    return {
      id: letter.id,
      letter,
      filterValues: {
        title: letter.title,
        recipient: letter.recipient || '',
        date: formatDocDate(letter.letter_date),
      },
      sortValues: {
        title: letter.title,
        recipient: letter.recipient || '',
        date: letter.letter_date || '',
        updated: letter.updated_at || '',
      },
      cells: {
        title: <span className="record-table__primary">{letter.title}</span>,
        recipient: letter.recipient || <span className="record-table__cell-muted">—</span>,
        date: formatDocDate(letter.letter_date),
        updated: formatDocDate(letter.updated_at),
        actions: (
          <span className="practice-docs__actions">
            {archived ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleArchive(letter)
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDelete(letter)
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
                  handleArchive(letter)
                }}
              >
                Archive
              </button>
            )}
          </span>
        ),
      },
    }
  })

  const editing = selectedId != null
  const editorTitle = selectedId === 'new' ? 'New letter' : title || 'Letter'
  const openLetter = letters.find((row) => row.id === selectedId)
  const openArchived = Boolean(openLetter?.archived_at)

  if (editing) {
    return (
      <DocumentWorkspace
        letter
        title={editorTitle}
        clientName={client?.real_name}
        onBack={handleCancel}
        actions={(
          <>
            {selectedId !== 'new' && openLetter && (
              openArchived ? (
                <>
                  <button type="button" className="secondary" onClick={() => handleArchive(openLetter)}>Restore</button>
                  <button type="button" className="danger" onClick={() => handleDelete(openLetter)}>Delete</button>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => handleArchive(openLetter)}>Archive</button>
              )
            )}
            <button type="button" className="secondary" onClick={handleDownload}>Download</button>
            <button type="button" className="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save letter'}
            </button>
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
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Recipient</span>
              <input
                className="progress-notes-page__meta-input"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="e.g. Dr Smith"
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Letter date</span>
              <input
                type="date"
                className="progress-notes-page__meta-input"
                value={letterDate}
                onChange={(event) => setLetterDate(event.target.value)}
              />
            </label>
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
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      embedded={embedded}
      title={embedded ? '' : 'Letters'}
      newLabel={archiveScope === 'active' ? 'letter' : undefined}
      onNew={archiveScope === 'active' ? handleNew : undefined}
      toolbar={<ArchiveScopeToggle value={archiveScope} onChange={setArchiveScope} />}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load letters.'}</p>}
      {!editing && !error && (
        <RecordTable
          remember={`letters-${clientId}`}
          columns={LETTER_COLUMNS}
          rows={rows}
          countNoun="letters"
          defaultSort={{ key: 'updated', direction: 'desc' }}
          emptyMessage={isPending
            ? 'Loading letters…'
            : (archiveScope === 'archived' ? 'No archived letters.' : 'No letters yet.')}
          onRowClick={(row) => selectLetter(row.letter)}
        />
      )}
    </RecordListLayout>
  )
}
