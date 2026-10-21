import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import BulkStatusBar from '../../components/BulkStatusBar'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import RowMenu from '../../components/RowMenu'
import StatusBadge from '../../components/StatusBadge'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useConfirm, usePrompt, useToast } from '../../components/ui'
import { useRowSelection } from '../../hooks/useRowSelection'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useLetterheadDownload } from '../../hooks/useLetterheadDownload'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
} from '../../lib/recordStatus'
import {
  childrenOf,
  practiceBreadcrumb,
  practiceFolder,
  practiceNameSortKey,
} from '../../lib/practiceItems'
import { usePracticeItemMutation, usePracticeItemsQuery } from '../../lib/practiceQueries'
import { getProfile } from '../../lib/store'
import { useTemplatesQuery } from '../../lib/templateQueries'
import DocumentWorkspace from '../client/DocumentWorkspace'

function formatUpdated(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const COLUMNS = [
  { key: 'mark', label: '', className: 'practice-docs__mark-col' },
  { key: 'name', label: 'Name', filter: 'text', sort: 'text' },
  { key: 'updated', label: 'Updated', sort: 'date' },
  STATUS_COLUMN,
  { key: 'actions', label: 'Actions', className: 'practice-docs__actions-col record-table__col--actions', sort: false },
]

function ItemMark({ kind }) {
  const folder = kind === 'folder'
  return (
    <span className={`practice-docs__mark${folder ? ' practice-docs__mark--folder' : ''}`}>
      {folder ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
          <path
            fill="currentColor"
            d="M3.5 8.2V7.1c0-.7.6-1.3 1.3-1.3h3.4l1.4 1.5h9.1c.7 0 1.3.6 1.3 1.3v8.6c0 .7-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.6-1.3-1.3V8.2z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            d="M7 3.8h6.2L18 8.6V20H7V3.8z"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            d="M13 3.8V8.6H18"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            d="M9.2 12.4h5.6M9.2 15.4h5.6"
          />
        </svg>
      )}
      <span className="sr-only">{folder ? 'Folder' : 'Document'}</span>
    </span>
  )
}

function folderMenuItems(item, { onRename, onDelete }) {
  return [
    { label: 'Rename', onSelect: onRename },
    { label: 'Delete', onSelect: onDelete, danger: true },
  ]
}

export default function PracticeDocumentsPage() {
  const toast = useToast()
  const { downloadDocument } = useLetterheadDownload()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const { setEditorOpen } = useOutletContext() || {}
  const { profile: accountProfile, user } = useAuth()
  const { data: items = [], isPending, error } = usePracticeItemsQuery()
  const mutate = usePracticeItemMutation()
  const { data: documentTemplates = [] } = useTemplatesQuery('working_document')
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedFolder = searchParams.get('folder')
  const folder = practiceFolder(items, requestedFolder)
  const folderId = folder?.id ?? null
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('Active')
  const [name, setName] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [editorVersion, setEditorVersion] = useState(0)
  const { selectedIds, selection: baseSelection, clear: clearSelection, count: selectedCount } = useRowSelection()

  const selection = useMemo(() => ({
    ...baseSelection,
    canSelect: (row) => row.item?.kind === 'document',
    label: (row) => `Select ${row.item?.name || 'document'}`,
  }), [baseSelection])

  const clinicianProfile = useMemo(
    () => clinicianProfileForEditor(accountProfile, user?.id ? getProfile(user.id) : null),
    [accountProfile, user],
  )
  const mergeContext = useMemo(
    () => buildMergeContext({ profile: clinicianProfile }),
    [clinicianProfile],
  )

  useEffect(() => {
    if (requestedFolder && !isPending && !folder) {
      setSearchParams({}, { replace: true })
    }
  }, [folder, isPending, requestedFolder, setSearchParams])

  const openFolder = (id) => {
    setSelectedId(null)
    if (id) setSearchParams({ folder: id })
    else setSearchParams({})
  }

  const crumbs = practiceBreadcrumb(items, folderId)
  const visible = useMemo(() => childrenOf(items, folderId), [items, folderId])

  const closeEditor = () => {
    setEditorOpen?.(false)
    setSelectedId(null)
  }

  const openDocument = (item) => {
    setEditorOpen?.(true)
    setSelectedId(item.id)
    setName(item.name)
    setContent(item.content || '<p></p>')
    setEditorVersion((value) => value + 1)
  }

  const startDocument = () => {
    setEditorOpen?.(true)
    setSelectedId('new')
    setName('Untitled document')
    setContent('<p></p>')
    setEditorVersion((value) => value + 1)
  }

  const createFolder = async () => {
    const nextName = await prompt({
      title: 'New folder',
      label: 'Folder name',
      confirmLabel: 'Create',
    })
    if (!nextName?.trim()) return
    try {
      await mutate.mutateAsync({ type: 'create', kind: 'folder', name: nextName, parentId: folderId })
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not create the folder.')
    }
  }

  const renameItem = async (item) => {
    const nextName = await prompt({
      title: item.kind === 'folder' ? 'Rename folder' : 'Rename document',
      label: 'Name',
      defaultValue: item.name,
      confirmLabel: 'Rename',
    })
    if (!nextName?.trim() || nextName.trim() === item.name) return
    try {
      await mutate.mutateAsync({ type: 'rename', id: item.id, name: nextName })
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not rename that item.')
    }
  }

  const removeFolder = async (item) => {
    const ok = await confirm({
      title: 'Delete folder?',
      message: `"${item.name}" and everything inside it will be removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await mutate.mutateAsync({ type: 'delete', id: item.id })
      if (selectedId === item.id) closeEditor()
      toast.success('Folder deleted.')
    } catch (err) {
      toast.error(err?.message || 'Could not delete that folder.')
    }
  }

  const moveStatus = async (item, nextStatus, toastLabel) => {
    try {
      await mutate.mutateAsync({ type: 'status', id: item.id, status: nextStatus })
      if (selectedId === item.id && nextStatus !== 'active') closeEditor()
      clearSelection()
      toast.saved(toastLabel)
    } catch (err) {
      toast.error(err?.message || 'Could not update that document.')
    }
  }

  const permanentlyDeleteDocument = async (item) => {
    const ok = await confirm({
      title: 'Permanently delete this document?',
      message: 'This cannot be undone.',
      confirmLabel: 'Permanently delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await mutate.mutateAsync({ type: 'delete', id: item.id })
      if (selectedId === item.id) closeEditor()
      clearSelection()
      toast.success('Document permanently deleted.')
    } catch (err) {
      toast.error(err?.message || 'Could not delete that document.')
    }
  }

  const downloadOne = async (item) => {
    try {
      const opened = await downloadDocument({
        title: item.name,
        bodyHtml: item.content,
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
    const targets = items.filter((item) => item.kind === 'document' && selectedIds.includes(item.id))
    if (!targets.length) return
    for (const item of targets) {
      // eslint-disable-next-line no-await-in-loop
      await action(item)
    }
  }

  const bulk = bulkActionsForStatus(statusFilter, {
    onArchive: () => runBulk((item) => moveStatus(item, 'archive', 'Documents archived')),
    onRestore: () => runBulk((item) => moveStatus(item, 'active', 'Documents restored')),
    onDelete: () => runBulk((item) => moveStatus(item, 'trash', 'Documents moved to trash')),
    onRestoreToArchive: () => runBulk((item) => moveStatus(item, 'archive', 'Documents restored to archive')),
    onPermanentDelete: async () => {
      const ok = await confirm({
        title: 'Permanently delete selected documents?',
        message: 'This cannot be undone.',
        confirmLabel: 'Permanently delete',
        tone: 'danger',
      })
      if (!ok) return
      await runBulk(async (item) => {
        await mutate.mutateAsync({ type: 'delete', id: item.id })
      })
      clearSelection()
      toast.saved('Documents permanently deleted')
    },
    onDownload: () => runBulk((item) => downloadOne(item)),
  })

  const applyTemplate = async (templateId) => {
    if (!templateId) return
    const template = documentTemplates.find((item) => item.id === templateId)
    if (!template) return
    if (hasMeaningfulEditorContent(content)) {
      const ok = await confirm({
        title: 'Replace document content?',
        message: 'This replaces the current document with the selected template.',
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setContent(template.content || '<p></p>')
    if (!name.trim() || name === 'Untitled document') setName(template.name)
    setEditorVersion((value) => value + 1)
  }

  const saveDocument = async () => {
    try {
      const saved = await mutate.mutateAsync({
        type: 'save',
        id: selectedId,
        parentId: folderId,
        name,
        content,
      })
      if (saved?.id) setSelectedId(saved.id)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not save the document.')
    }
  }

  const rows = visible.map((item) => {
    const isFolder = item.kind === 'folder'
    const status = isFolder ? 'active' : recordStatusOf(item)
    const readOnly = !isFolder && status !== 'active'
    return {
      id: item.id,
      item,
      filterValues: {
        name: item.name,
        state: isFolder ? 'Active' : statusLabelOf(item),
      },
      sortValues: {
        name: practiceNameSortKey(item),
        updated: item.updated_at,
        state: isFolder ? 'Active' : statusLabelOf(item),
      },
      muted: readOnly,
      cells: {
        mark: <ItemMark kind={item.kind} />,
        name: <span className="record-table__primary">{item.name}</span>,
        updated: formatUpdated(item.updated_at),
        state: isFolder ? <span className="record-table__cell-muted">—</span> : <StatusBadge status={status} />,
        actions: isFolder ? (
          <RowMenu
            label={`Actions for ${item.name}`}
            items={folderMenuItems(item, {
              onRename: () => renameItem(item),
              onDelete: () => removeFolder(item),
            })}
          />
        ) : (
          <RowMenu
            label={`Actions for ${item.name}`}
            items={statusMenuItems(status, {
              onEdit: () => openDocument(item),
              onView: () => openDocument(item),
              onArchive: () => moveStatus(item, 'archive', 'Document archived'),
              onRestore: () => moveStatus(item, 'active', 'Document restored'),
              onDelete: () => moveStatus(item, 'trash', 'Document moved to trash'),
              onRestoreToArchive: () => moveStatus(item, 'archive', 'Document restored to archive'),
              onPermanentDelete: () => permanentlyDeleteDocument(item),
              onDownload: () => downloadOne(item),
            })}
          />
        ),
      },
    }
  })

  const editing = selectedId != null
  const currentItem = items.find((item) => item.id === selectedId)
  const openStatus = currentItem ? recordStatusOf(currentItem) : 'active'
  const openReadOnly = selectedId !== 'new' && openStatus !== 'active'

  if (editing) {
    return (
      <DocumentWorkspace
        title={name.trim() || 'Document'}
        onBack={closeEditor}
        actions={!openReadOnly ? (
          <button type="button" className="primary" onClick={saveDocument} disabled={mutate.isPending}>
            {mutate.isPending ? 'Saving…' : 'Save'}
          </button>
        ) : null}
        inspectorExtras={(
          <>
            {selectedId !== 'new' && currentItem && openStatus === 'archive' && (
              <button type="button" className="secondary" onClick={() => moveStatus(currentItem, 'active', 'Document restored')} disabled={mutate.isPending}>Restore</button>
            )}
            {selectedId !== 'new' && currentItem && openStatus === 'trash' && (
              <button type="button" className="secondary" onClick={() => moveStatus(currentItem, 'archive', 'Document restored to archive')} disabled={mutate.isPending}>Restore to archive</button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => downloadOne({ name, content })}
            >
              Download
            </button>
          </>
        )}
        meta={(
          <>
            <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
              <span className="progress-notes-page__meta-label">Title</span>
              <input
                className="progress-notes-page__meta-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={openReadOnly}
              />
            </label>
            {!openReadOnly && (
              <label className="progress-notes-page__meta-field progress-notes-page__meta-field--template">
                <span className="progress-notes-page__meta-label">Template</span>
                <select
                  className="progress-notes-page__meta-input"
                  value=""
                  onChange={(event) => applyTemplate(event.target.value)}
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

  const showNewActions = statusFilter === 'Active'

  return (
    <RecordListLayout
      title={folder?.name || 'My Documents'}
      newLabel={showNewActions ? 'document' : undefined}
      onNew={showNewActions ? startDocument : undefined}
      headerActions={showNewActions ? (
        <button type="button" className="secondary" onClick={createFolder}>New folder</button>
      ) : null}
    >
      {crumbs.length > 0 && (
        <nav className="practice-crumbs" aria-label="Folder">
          <button type="button" onClick={() => openFolder(null)}>My Documents</button>
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1
            return (
              <span key={crumb.id} className="practice-crumbs__step">
                <span className="practice-crumbs__sep" aria-hidden>/</span>
                {current ? (
                  <span className="practice-crumbs__current">{crumb.name}</span>
                ) : (
                  <button type="button" onClick={() => openFolder(crumb.id)}>{crumb.name}</button>
                )}
              </span>
            )
          })}
        </nav>
      )}
      {error && (
        <p className="form-error" role="alert">{error.message || 'Could not load documents.'}</p>
      )}
      <BulkStatusBar
        count={selectedCount}
        noun="documents"
        actions={bulk}
        onClear={clearSelection}
      />
      {!error && (
        <RecordTable
          remember="practice-documents-status"
          columns={COLUMNS}
          rows={rows}
          countNoun="items"
          defaultSort={{ key: 'name', direction: 'asc' }}
          defaultFilters={STATUS_DEFAULT_FILTERS}
          selection={selection}
          emptyMessage={isPending ? 'Loading documents…' : (folder ? 'This folder is empty.' : 'No documents yet.')}
          onRowClick={(row) => {
            if (row.item.kind === 'folder') openFolder(row.item.id)
            else openDocument(row.item)
          }}
          onFiltersChange={(next) => {
            const status = String(next?.state || 'Active')
            if (status !== statusFilter) setStatusFilter(status)
          }}
        />
      )}
    </RecordListLayout>
  )
}
