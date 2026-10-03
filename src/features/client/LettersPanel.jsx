import { useState, useEffect } from 'react'
import RichTextEditor from '../../components/RichTextEditor'
import { useClientSession } from '../../lib/useClientSession'
import { getLetters, saveLetter, getProfile } from '../../lib/store'
import { downloadLetterPdf } from '../../lib/clinicalExport'
import { getClinicalExportBranding } from '../../lib/workplaceBranding'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useToast } from '../../components/ui'

function formatDocDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const LETTER_COLUMNS = [
  { key: 'title', label: 'Title', filter: { type: 'text', placeholder: 'Filter title…' } },
  { key: 'recipient', label: 'Recipient', filter: { type: 'text', placeholder: 'Filter recipient…' } },
  { key: 'date', label: 'Letter date', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'author', label: 'Created by', filter: { type: 'select', allLabel: 'All authors' } },
  { key: 'updated', label: 'Last updated' },
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
  const toast = useToast()

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

  const handleDownload = () => {
    const branding = getClinicalExportBranding(client?.workplace_id, session?.user?.id)
    const author = session?.user?.id ? getProfile(session.user.id) : null
    const opened = downloadLetterPdf(
      {
        title: title.trim() || 'Untitled letter',
        content,
        recipient,
        letter_date: letterDate,
      },
      {
        clientName: client?.real_name,
        authorName: author?.full_name,
        branding,
      },
    )
    if (!opened) {
      toast.error('Could not open the print dialog. Please try again.')
      return
    }
    toast.info('Choose “Save as PDF” in the print dialog.')
  }

  const rows = letters.map(letter => ({
    id: letter.id,
    letter,
    filterValues: {
      title: letter.title,
      recipient: letter.recipient || '—',
      date: formatDocDate(letter.letter_date),
      author: getProfile(letter.author_id)?.full_name || '—',
    },
    cells: {
      title: <span className="record-table__primary">{letter.title}</span>,
      recipient: letter.recipient || '—',
      date: formatDocDate(letter.letter_date),
      author: getProfile(letter.author_id)?.full_name || '—',
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
        </div>
      </div>
      <RichTextEditor key={selectedId} content={content} onChange={setContent} />
    </div>
  )

  return (
    <RecordListLayout
      title={editing ? editorTitle : 'Letters'}
      subtitle={editing
        ? 'Compose and save correspondence for this client.'
        : 'Correspondence and formal letters for this client.'}
      newLabel={editing ? undefined : 'letter'}
      onNew={editing ? undefined : handleNew}
      headerActions={editing ? (
        <>
          <button type="button" className="secondary" onClick={handleDownload}>Download</button>
          <button type="button" className="secondary" onClick={handleCancel}>Cancel</button>
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
          emptyMessage="No letters yet."
          onRowClick={(row) => selectLetter(row.letter)}
        />
      )}
    </RecordListLayout>
  )
}
