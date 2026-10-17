import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ArchiveScopeToggle from '../../components/ArchiveScopeToggle'
import RichTextEditor from '../../components/RichTextEditor'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useClientSession } from '../../lib/useClientSession'
import { filterByArchiveScope } from '../../lib/archiveScope'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useTemplatesQuery } from '../../lib/templateQueries'
import { getProfile } from '../../lib/store'
import {
  deleteWorkingDocument,
  listWorkingDocuments,
  saveWorkingDocumentForUser,
  setWorkingDocumentArchived,
} from '../../lib/supabase/workingDocumentsRepo'
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
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function WorkingDocumentsPanel({ embedded = false }) {
  const { clientId, client, session } = useClientSession()
  const { data: documents = [], refetch, isPending, error } = useQuery({
    queryKey: ['working-documents', clientId],
    queryFn: () => listWorkingDocuments(clientId),
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

  const refresh = () => refetch()

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
    saveWorkingDocumentForUser({
      id: selectedId === 'new' ? undefined : selectedId,
      client_id: clientId,
      title: title.trim(),
      content,
    }, session.user.id).then((saved) => {
      refresh()
      setSelectedId(saved.id)
      toast.saved()
    }).catch((err) => {
      toast.error(err.message || 'Could not save the document.')
    }).finally(() => {
      setSaving(false)
    })
  }

  const handleArchive = async (doc) => {
    try {
      await setWorkingDocumentArchived(doc.id, !doc.archived_at)
      await refresh()
      toast.saved(doc.archived_at ? 'Document restored' : 'Document archived')
    } catch (err) {
      toast.error(err?.message || 'Could not update this document')
    }
  }

  const handleDelete = async (doc) => {
    const ok = await confirm({
      title: 'Delete this document?',
      message: 'This permanently removes the working document.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteWorkingDocument(doc.id)
      if (selectedId === doc.id) setSelectedId(null)
      await refresh()
      toast.saved('Document deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this document')
    }
  }

  const scopedDocuments = useMemo(
    () => filterByArchiveScope(documents, archiveScope),
    [documents, archiveScope],
  )

  const rows = scopedDocuments.map(doc => {
    const archived = Boolean(doc.archived_at)
    return {
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
        actions: (
          <span className="practice-docs__actions">
            {archived ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleArchive(doc)
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDelete(doc)
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
                  handleArchive(doc)
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
  const editorTitle = selectedId === 'new' ? 'New working document' : title || 'Working document'
  const openDoc = documents.find((row) => row.id === selectedId)
  const openArchived = Boolean(openDoc?.archived_at)

  if (editing) {
    return (
      <DocumentWorkspace
        title={editorTitle}
        clientName={client?.real_name}
        onBack={handleCancel}
        actions={(
          <>
            {selectedId !== 'new' && openDoc && (
              openArchived ? (
                <>
                  <button type="button" className="secondary" onClick={() => handleArchive(openDoc)}>Restore</button>
                  <button type="button" className="danger" onClick={() => handleDelete(openDoc)}>Delete</button>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => handleArchive(openDoc)}>Archive</button>
              )
            )}
            <button type="button" className="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save document'}
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
      embedded={embedded}
      title={embedded ? '' : 'Working documents'}
      newLabel={archiveScope === 'active' ? 'working document' : undefined}
      onNew={archiveScope === 'active' ? handleNew : undefined}
      toolbar={<ArchiveScopeToggle value={archiveScope} onChange={setArchiveScope} />}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load documents.'}</p>}
      {!editing && !error && (
        <RecordTable
          remember={`working-documents-${clientId}`}
          columns={DOC_COLUMNS}
          rows={rows}
          defaultSort={{ key: 'updated', direction: 'desc' }}
          countNoun="documents"
          emptyMessage={isPending
            ? 'Loading documents…'
            : (archiveScope === 'archived' ? 'No archived documents.' : 'No working documents yet.')}
          onRowClick={(row) => selectDocument(row.doc)}
        />
      )}
    </RecordListLayout>
  )
}
