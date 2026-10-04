import { useState, useEffect, useMemo } from 'react'
import RichTextEditor from '../../components/RichTextEditor'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useClientSession } from '../../lib/useClientSession'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useTemplatesQuery } from '../../lib/templateQueries'
import {
  getWorkingDocuments,
  saveWorkingDocument,
  getProfile,
} from '../../lib/store'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useToast, useConfirm } from '../../components/ui'
import { useClientChrome } from './ClientChrome'
import DocumentWorkspace from './DocumentWorkspace'

function formatDocDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const DOC_COLUMNS = [
  { key: 'title', label: 'Title', filter: 'text' },
  { key: 'created', label: 'Created', sort: 'date' },
  { key: 'updated', label: 'Last updated', sort: 'date' },
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
  const setEditorOpen = useClientChrome()?.setEditorOpen

  useEffect(() => {
    if (!setEditorOpen) return undefined
    setEditorOpen(selectedId != null)
    return () => setEditorOpen(false)
  }, [selectedId, setEditorOpen])

  const { profile: accountProfile } = useAuth()
  const { data: documentTemplates = [] } = useTemplatesQuery('working_document')
  const clinicianProfile = useMemo(
    () => clinicianProfileForEditor(accountProfile, session?.user?.id ? getProfile(session.user.id) : null),
    [accountProfile, session?.user?.id],
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

  const applyDocumentTemplate = async (templateId) => {
    if (!templateId) return
    const template = documentTemplates.find((item) => item.id === templateId)
    if (!template) return
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
      const saved = saveWorkingDocument({
        id: selectedId === 'new' ? undefined : selectedId,
        client_id: clientId,
        title: title.trim(),
        content,
      }, session.user.id)
      refresh()
      setSelectedId(saved.id)
      toast.saved()
    } finally {
      setSaving(false)
    }
  }

  const rows = documents.map(doc => ({
    id: doc.id,
    doc,
    filterValues: {
      title: doc.title,
    },
    sortValues: {
      title: doc.title,
      created: doc.created_at || '',
      updated: doc.updated_at || '',
    },
    cells: {
      title: <span className="record-table__primary">{doc.title}</span>,
      created: formatDocDate(doc.created_at),
      updated: formatDocDate(doc.updated_at),
    },
  }))

  const editing = selectedId != null
  const editorTitle = selectedId === 'new' ? 'New working document' : title || 'Working document'

  if (editing) {
    return (
      <DocumentWorkspace
        title={editorTitle}
        clientName={client?.real_name}
        onBack={handleCancel}
        actions={(
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save document'}
          </button>
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
            <label className="progress-notes-page__meta-field progress-notes-page__meta-field--template">
              <span className="progress-notes-page__meta-label">Template</span>
              <select
                className="progress-notes-page__meta-input"
                value=""
                onChange={(event) => applyDocumentTemplate(event.target.value)}
              >
                <option value="">Choose a template…</option>
                {documentTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
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
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      title="Working documents"
      newLabel="working document"
      onNew={handleNew}
    >
      {!editing && (
        <RecordTable
          columns={DOC_COLUMNS}
          rows={rows}
          defaultSort={{ key: 'updated', direction: 'desc' }}
          countNoun="documents"
          emptyMessage="No working documents yet."
          onRowClick={(row) => selectDocument(row.doc)}
        />
      )}
    </RecordListLayout>
  )
}
