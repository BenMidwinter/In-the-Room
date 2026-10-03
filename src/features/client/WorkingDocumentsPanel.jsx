import { useState, useEffect, useMemo } from 'react'
import RichTextEditor from '../../components/RichTextEditor'
import TemplatePicker, { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useClientSession } from '../../lib/useClientSession'
import { buildMergeContext } from '../../lib/mergeFields'
import {
  getWorkingDocuments,
  saveWorkingDocument,
  getAvailableLetterTemplates,
  getProfile,
} from '../../lib/store'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useToast, useConfirm } from '../../components/ui'

function formatDocDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const DOC_COLUMNS = [
  { key: 'title', label: 'Title', filter: { type: 'text', placeholder: 'Filter title…' } },
  { key: 'author', label: 'Created by', filter: { type: 'select', allLabel: 'All authors' } },
  { key: 'created', label: 'Created', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'updated', label: 'Last updated' },
]

export default function WorkingDocumentsPanel() {
  const { clientId, client, session } = useClientSession()
  const [documents, setDocuments] = useState(() => getWorkingDocuments(clientId))
  const [selectedId, setSelectedId] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [saving, setSaving] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const toast = useToast()
  const confirm = useConfirm()

  const clinicianProfile = session?.user?.id ? getProfile(session.user.id) : null
  const documentTemplates = useMemo(
    () => getAvailableLetterTemplates(client?.workplace_id),
    [client?.workplace_id],
  )

  const mergeContext = useMemo(
    () => buildMergeContext({
      client,
      appointment: null,
      profile: clinicianProfile,
      sessionDate: todayISO(),
    }),
    [client, clinicianProfile],
  )

  useEffect(() => {
    setDocuments(getWorkingDocuments(clientId))
    setSelectedId(null)
  }, [clientId])

  const refresh = () => setDocuments(getWorkingDocuments(clientId))

  const handleCancel = () => setSelectedId(null)

  const selectDocument = (doc) => {
    setSelectedId(doc.id)
    setTitle(doc.title)
    setContent(doc.content)
    setEditorVersion(v => v + 1)
  }

  const handleNew = () => {
    setSelectedId('new')
    setTitle('Untitled document')
    setContent('<p></p>')
    setEditorVersion(v => v + 1)
  }

  const applyDocumentTemplate = async (template) => {
    if (hasMeaningfulEditorContent(content)) {
      const ok = await confirm({
        title: 'Replace document content?',
        message: 'This replaces the current document content with the selected template.',
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setContent(template.content)
    if (!title.trim() || title === 'Untitled document') {
      setTitle(template.name)
    }
    setEditorVersion(v => v + 1)
  }

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Please add a document title.')
      return
    }
    if (!session?.user?.id) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    setSaving(true)
    try {
      saveWorkingDocument({
        id: selectedId === 'new' ? undefined : selectedId,
        client_id: clientId,
        title: title.trim(),
        content,
      }, session.user.id)
      refresh()
      setSelectedId(null)
      setTitle('')
      setContent('<p></p>')
    } finally {
      setSaving(false)
    }
  }

  const rows = documents.map(doc => ({
    id: doc.id,
    doc,
    filterValues: {
      title: doc.title,
      author: getProfile(doc.author_id)?.full_name || '—',
      created: formatDocDate(doc.created_at),
    },
    cells: {
      title: <span className="record-table__primary">{doc.title}</span>,
      author: getProfile(doc.author_id)?.full_name || '—',
      created: formatDocDate(doc.created_at),
      updated: formatDocDate(doc.updated_at),
    },
  }))

  const editing = selectedId != null
  const editorTitle = selectedId === 'new' ? 'New working document' : title || 'Edit document'

  const editor = (
    <div className="record-editor split-layout__main split-layout__main--doc">
      <div className="doc-meta-fields">
        <div className="form-group doc-meta-fields__title">
          <label>Document title</label>
          <input
            className="paper-input doc-meta-fields__title-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Formulation draft"
          />
        </div>
        <TemplatePicker
          templates={documentTemplates}
          onApply={applyDocumentTemplate}
          label="Document template"
          emptyLabel="Choose a template…"
        />
      </div>
      <RichTextEditor
        key={`${selectedId}-${editorVersion}`}
        content={content}
        onChange={setContent}
        variant="a4"
        mode="clinical"
        mergeContext={mergeContext}
        clinicianProfile={clinicianProfile}
      />
    </div>
  )

  return (
    <RecordListLayout
      title={editing ? editorTitle : 'Working documents'}
      subtitle={editing
        ? 'Draft and save internal working papers for this client.'
        : 'Draft formulations, care plans, and internal working papers.'}
      newLabel={editing ? undefined : 'working document'}
      onNew={editing ? undefined : handleNew}
      headerActions={editing ? (
        <>
          <button type="button" className="secondary" onClick={handleCancel}>Cancel</button>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save document'}
          </button>
        </>
      ) : undefined}
      editor={editing ? editor : undefined}
    >
      {!editing && (
        <RecordTable
          columns={DOC_COLUMNS}
          rows={rows}
          emptyMessage="No working documents yet."
          onRowClick={(row) => selectDocument(row.doc)}
        />
      )}
    </RecordListLayout>
  )
}
