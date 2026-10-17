import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import BulkStatusBar from '../../components/BulkStatusBar'
import RichTextEditor from '../../components/RichTextEditor'
import RowMenu from '../../components/RowMenu'
import StatusBadge from '../../components/StatusBadge'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useClientSession } from '../../lib/useClientSession'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useTemplatesQuery } from '../../lib/templateQueries'
import { getProfile } from '../../lib/store'
import { downloadRichDocumentPdf } from '../../lib/clinicalExport'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
} from '../../lib/recordStatus'
import { useRowSelection } from '../../hooks/useRowSelection'
import {
  deleteWorkingDocument,
  listWorkingDocuments,
  saveWorkingDocumentForUser,
  setWorkingDocumentStatus,
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
  STATUS_COLUMN,
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function WorkingDocumentsPanel({ embedded = false }) {
  const { clientId, client, session } = useClientSession()
  const { data: documents = [], refetch, isPending, error } = useQuery({
    queryKey: ['working-documents', clientId],
    queryFn: () => listWorkingDocuments(clientId),
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
  const [saving, setSaving] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const toast = useToast()
  const confirm = useConfirm()
  const { selectedIds, selection, clear: clearSelection, count: selectedCount } = useRowSelection()
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

  const moveStatus = async (doc, nextStatus, toastLabel) => {
    try {
      await setWorkingDocumentStatus(doc.id, nextStatus)
      if (selectedId === doc.id && nextStatus !== 'active') setSelectedId(null)
      await refresh()
      clearSelection()
      toast.saved(toastLabel)
    } catch (err) {
      toast.error(err?.message || 'Could not update this document')
    }
  }

  const permanentlyDelete = async (doc) => {
    const ok = await confirm({
      title: 'Permanently delete this document?',
      message: 'This cannot be undone.',
      confirmLabel: 'Permanently delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteWorkingDocument(doc.id)
      if (selectedId === doc.id) setSelectedId(null)
      await refresh()
      clearSelection()
      toast.saved('Document permanently deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete this document')
    }
  }

  const downloadOne = async (doc) => {
    try {
      const opened = await downloadRichDocumentPdf({
        title: doc.title,
        bodyHtml: doc.content,
        mergeContext: buildMergeContext({
          client,
          appointment: null,
          profile: clinicianProfile,
          sessionDate: todayISO(),
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

  const handleDownload = () => downloadOne({
    title: title.trim() || 'Untitled document',
    content,
  })

  const runBulk = async (action) => {
    const targets = documents.filter((doc) => selectedIds.includes(doc.id))
    if (!targets.length) return
    for (const doc of targets) {
      // eslint-disable-next-line no-await-in-loop
      await action(doc)
    }
  }

  const bulk = bulkActionsForStatus(statusFilter, {
    onArchive: () => runBulk((doc) => moveStatus(doc, 'archive', 'Documents archived')),
    onRestore: () => runBulk((doc) => moveStatus(doc, 'active', 'Documents restored')),
    onDelete: () => runBulk((doc) => moveStatus(doc, 'trash', 'Documents moved to trash')),
    onRestoreToArchive: () => runBulk((doc) => moveStatus(doc, 'archive', 'Documents restored to archive')),
    onPermanentDelete: async () => {
      const ok = await confirm({
        title: 'Permanently delete selected documents?',
        message: 'This cannot be undone.',
        confirmLabel: 'Permanently delete',
        tone: 'danger',
      })
      if (!ok) return
      await runBulk(async (doc) => {
        await deleteWorkingDocument(doc.id)
      })
      await refresh()
      clearSelection()
      toast.saved('Documents permanently deleted')
    },
    onDownload: () => runBulk((doc) => downloadOne(doc)),
  })

  const rows = documents.map(doc => {
    const status = recordStatusOf(doc)
    const readOnly = status !== 'active'
    return {
      id: doc.id,
      doc,
      filterValues: {
        title: doc.title,
        status: statusLabelOf(doc),
      },
      sortValues: {
        title: doc.title,
        created: doc.created_at || '',
        updated: doc.updated_at || '',
        status: statusLabelOf(doc),
      },
      muted: readOnly,
      cells: {
        title: <span className="record-table__primary">{doc.title}</span>,
        created: formatDocDate(doc.created_at),
        updated: formatDocDate(doc.updated_at),
        status: <StatusBadge status={status} />,
        actions: (
          <RowMenu
            label={`Actions for ${doc.title}`}
            items={statusMenuItems(status, {
              onEdit: () => selectDocument(doc),
              onView: () => selectDocument(doc),
              onArchive: () => moveStatus(doc, 'archive', 'Document archived'),
              onRestore: () => moveStatus(doc, 'active', 'Document restored'),
              onDelete: () => moveStatus(doc, 'trash', 'Document moved to trash'),
              onRestoreToArchive: () => moveStatus(doc, 'archive', 'Document restored to archive'),
              onPermanentDelete: () => permanentlyDelete(doc),
              onDownload: () => downloadOne(doc),
            })}
          />
        ),
      },
    }
  })

  const editing = selectedId != null
  const editorTitle = selectedId === 'new' ? 'New working document' : title || 'Working document'
  const openDoc = documents.find((row) => row.id === selectedId)
  const openStatus = openDoc ? recordStatusOf(openDoc) : 'active'
  const openReadOnly = selectedId !== 'new' && openStatus !== 'active'

  if (editing) {
    return (
      <DocumentWorkspace
        title={editorTitle}
        clientName={client?.real_name}
        onBack={handleCancel}
        actions={(
          <>
            {selectedId !== 'new' && openDoc && openStatus === 'archive' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openDoc, 'active', 'Document restored')}>Restore</button>
            )}
            {selectedId !== 'new' && openDoc && openStatus === 'trash' && (
              <button type="button" className="secondary" onClick={() => moveStatus(openDoc, 'archive', 'Document restored to archive')}>Restore to archive</button>
            )}
            <button type="button" className="secondary" onClick={handleDownload}>Download</button>
            {!openReadOnly && (
              <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save document'}
              </button>
            )}
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
            {!openReadOnly && (
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
          editable={!openReadOnly}
        />
      </DocumentWorkspace>
    )
  }

  return (
    <RecordListLayout
      embedded={embedded}
      title={embedded ? '' : 'Working documents'}
      newLabel="working document"
      onNew={handleNew}
    >
      {error && <p className="form-error" role="alert">{error.message || 'Could not load documents.'}</p>}
      <BulkStatusBar
        count={selectedCount}
        noun="documents"
        actions={bulk}
        onClear={clearSelection}
      />
      {!editing && !error && (
        <RecordTable
          remember={`working-documents-status-${clientId}`}
          columns={DOC_COLUMNS}
          rows={rows}
          defaultSort={{ key: 'updated', direction: 'desc' }}
          defaultFilters={STATUS_DEFAULT_FILTERS}
          selection={selection}
          countNoun="documents"
          emptyMessage={isPending ? 'Loading documents…' : 'No working documents yet.'}
          onRowClick={(row) => selectDocument(row.doc)}
          onFiltersChange={(next) => {
            const status = String(next?.status || 'Active')
            if (status !== statusFilter) setStatusFilter(status)
          }}
        />
      )}
    </RecordListLayout>
  )
}
