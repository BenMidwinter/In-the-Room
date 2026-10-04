import { useState, useEffect, useMemo } from 'react'
import RichTextEditor from '../../components/RichTextEditor'
import { useClientSession } from '../../lib/useClientSession'
import { getLetters, saveLetter, getProfile } from '../../lib/store'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useTemplatesQuery } from '../../lib/templateQueries'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { downloadLetterPdf } from '../../lib/clinicalExport'
import { loadClinicianPrintIdentity, resolveDownloadLetterhead } from '../../lib/letterheadPrint'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useChoose, useConfirm, useToast } from '../../components/ui'
import { useClientChrome } from './ClientChrome'

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
]

export default function LettersPanel() {
  const { clientId, session, client } = useClientSession()
  const [letters, setLetters] = useState(() => getLetters(clientId))
  const [selectedId, setSelectedId] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [recipient, setRecipient] = useState('')
  const [letterDate, setLetterDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const toast = useToast()
  const confirm = useConfirm()
  const chooseLetterhead = useChoose()
  const { profile: accountProfile } = useAuth()
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
  const setEditorOpen = useClientChrome()?.setEditorOpen

  useEffect(() => {
    if (!setEditorOpen) return undefined
    setEditorOpen(selectedId != null)
    return () => setEditorOpen(false)
  }, [selectedId, setEditorOpen])

  useEffect(() => {
    setLetters(getLetters(clientId))
    setSelectedId(null)
  }, [clientId])

  const refresh = () => setLetters(getLetters(clientId))

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

  const handleSave = () => {
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
      const saved = saveLetter({
        id: selectedId === 'new' ? undefined : selectedId,
        client_id: clientId,
        title: title.trim(),
        content,
        recipient,
        letter_date: letterDate,
      }, session.user.id)
      refresh()
      setSelectedId(null)
      setTitle('')
      setContent('<p></p>')
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async () => {
    try {
      const identity = await loadClinicianPrintIdentity(session?.user?.id)
      const letterhead = await resolveDownloadLetterhead(await listLetterheads(), chooseLetterhead, identity)
      if (!letterhead) return
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

  const rows = letters.map(letter => ({
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
    },
  }))

  const editing = selectedId != null
  const editorTitle = selectedId === 'new' ? 'New letter' : title || 'Edit letter'

  const editor = (
    <div className="record-editor split-layout__main split-layout__main--doc">
      <div className="doc-meta-fields">
        <div className="form-group doc-meta-fields__title">
          <label>Title</label>
          <input
            className="paper-input doc-meta-fields__title-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Letter to GP"
          />
        </div>
        <div className="doc-meta-fields__extras">
          <div className="form-group">
            <label>Recipient</label>
            <input
              className="paper-input"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="e.g. Dr Smith, Oak Medical Centre"
            />
          </div>
          <div className="form-group">
            <label>Letter date</label>
            <input
              type="date"
              className="paper-input"
              value={letterDate}
              onChange={e => setLetterDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Template</label>
            <select
              className="paper-input"
              value=""
              onChange={(event) => applyLetterTemplate(event.target.value)}
            >
              <option value="">Choose a template…</option>
              {letterTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <RichTextEditor
        key={`${selectedId}-${editorVersion}`}
        content={content}
        onChange={setContent}
        mode="clinical"
        mergeContext={mergeContext}
        clinicianProfile={clinicianProfile}
      />
    </div>
  )

  return (
    <RecordListLayout
      title={editing ? editorTitle : 'Letters'}
      newLabel={editing ? undefined : 'letter'}
      onNew={editing ? undefined : handleNew}
      headerActions={editing ? (
        <>
          <button type="button" className="secondary" onClick={handleCancel}>Back</button>
          <button type="button" className="secondary" onClick={handleDownload}>Download</button>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save letter'}
          </button>
        </>
      ) : undefined}
      editor={editing ? editor : undefined}
    >
      {!editing && (
        <RecordTable
          columns={LETTER_COLUMNS}
          rows={rows}
          countNoun="letters"
          defaultSort={{ key: 'updated', direction: 'desc' }}
          emptyMessage="No letters yet."
          onRowClick={(row) => selectLetter(row.letter)}
        />
      )}
    </RecordListLayout>
  )
}
