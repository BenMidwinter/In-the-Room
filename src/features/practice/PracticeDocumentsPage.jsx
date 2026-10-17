import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { useConfirm, usePrompt, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
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
  { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
  { key: 'updated', label: 'Updated', sort: 'date' },
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

export default function PracticeDocumentsPage() {
  const toast = useToast()
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
  const [name, setName] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [editorVersion, setEditorVersion] = useState(0)

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
  const visible = childrenOf(items, folderId)

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

  const removeItem = async (item) => {
    const ok = await confirm({
      title: item.kind === 'folder' ? 'Delete folder?' : 'Delete document?',
      message: item.kind === 'folder'
        ? `"${item.name}" and everything inside it will be removed.`
        : `"${item.name}" will be removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await mutate.mutateAsync({ type: 'delete', id: item.id })
      if (selectedId === item.id) closeEditor()
      toast.success(item.kind === 'folder' ? 'Folder deleted.' : 'Document deleted.')
    } catch (err) {
      toast.error(err?.message || 'Could not delete that item.')
    }
  }

  const archiveItem = async (item) => {
    try {
      await mutate.mutateAsync({ type: 'archive', id: item.id, archived: !item.archived_at })
      toast.saved(item.archived_at ? 'Document restored' : 'Document archived')
    } catch (err) {
      toast.error(err?.message || 'Could not update that item.')
    }
  }

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
    const status = item.archived_at ? 'Archived' : 'Active'
    return {
      id: item.id,
      item,
      filterValues: {
        name: item.name,
        status,
      },
      sortValues: {
        name: practiceNameSortKey(item),
        status,
        updated: item.updated_at,
      },
      cells: {
        mark: <ItemMark kind={item.kind} />,
        name: <span className="record-table__primary">{item.name}</span>,
        status: <span className={`badge ${item.archived_at ? 'badge-grey' : 'badge-green'}`}>{status}</span>,
        updated: formatUpdated(item.updated_at),
        actions: (
          <span className="practice-docs__actions">
            <button
              type="button"
              className="danger"
              onClick={(event) => {
                event.stopPropagation()
                removeItem(item)
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="secondary"
              onClick={(event) => {
                event.stopPropagation()
                renameItem(item)
              }}
            >
              Rename
            </button>
            {item.kind === 'document' && (
              <button
                type="button"
                className="secondary"
                onClick={(event) => {
                  event.stopPropagation()
                  archiveItem(item)
                }}
              >
                {item.archived_at ? 'Restore' : 'Archive'}
              </button>
            )}
          </span>
        ),
      },
    }
  })

  const editing = selectedId != null
  const currentItem = items.find((item) => item.id === selectedId)

  if (editing) {
    return (
      <DocumentWorkspace
        title={name.trim() || 'Document'}
        onBack={closeEditor}
        actions={(
          <>
            {selectedId !== 'new' && (
              <button
                type="button"
                className="secondary"
                onClick={() => currentItem && removeItem(currentItem)}
                disabled={mutate.isPending}
              >
                Delete
              </button>
            )}
            <button type="button" className="primary" onClick={saveDocument} disabled={mutate.isPending}>
              {mutate.isPending ? 'Saving…' : 'Save'}
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
              />
            </label>
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
      title={folder?.name || 'My Documents'}
      newLabel="document"
      onNew={startDocument}
      headerActions={(
        <button type="button" className="secondary" onClick={createFolder}>New folder</button>
      )}
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
      {!error && (
        <RecordTable
          remember="practice-documents"
          columns={COLUMNS}
          rows={rows}
          countNoun="items"
          defaultSort={{ key: 'name', direction: 'asc' }}
          emptyMessage={isPending ? 'Loading documents…' : (folder ? 'This folder is empty.' : 'No documents yet.')}
          onRowClick={(row) => {
            if (row.item.kind === 'folder') openFolder(row.item.id)
            else openDocument(row.item)
          }}
        />
      )}
    </RecordListLayout>
  )
}
