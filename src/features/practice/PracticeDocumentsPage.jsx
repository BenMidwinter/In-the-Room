import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import { useConfirm, usePrompt, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { getProfile } from '../../lib/store'
import {
  childrenOf,
  practiceBreadcrumb,
  practiceFolder,
  practiceNameSortKey,
} from '../../lib/practiceItems'
import { usePracticeItemMutation, usePracticeItemsQuery } from '../../lib/practiceQueries'

function formatUpdated(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const COLUMNS = [
  { key: 'name', label: 'Name', filter: 'text', sort: 'text' },
  { key: 'kind', label: 'Kind', filter: 'choice', sort: 'text' },
  { key: 'updated', label: 'Updated', sort: 'date' },
  { key: 'actions', label: '', className: 'practice-docs__actions-col' },
]

export default function PracticeDocumentsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const { setEditorOpen } = useOutletContext() || {}
  const { profile: accountProfile, user } = useAuth()
  const { data: items = [], isPending, error } = usePracticeItemsQuery()
  const mutate = usePracticeItemMutation()
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
        ? `“${item.name}” and everything inside it will be removed.`
        : `“${item.name}” will be removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await mutate.mutateAsync({ type: 'delete', id: item.id })
      toast.success(item.kind === 'folder' ? 'Folder deleted.' : 'Document deleted.')
    } catch (err) {
      toast.error(err?.message || 'Could not delete that item.')
    }
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

  const rows = visible.map((item) => ({
    id: item.id,
    item,
    filterValues: {
      name: item.name,
      kind: item.kind === 'folder' ? 'Folder' : 'Document',
    },
    sortValues: {
      name: practiceNameSortKey(item),
      kind: item.kind === 'folder' ? '0' : '1',
      updated: item.updated_at,
    },
    cells: {
      name: <span className="record-table__primary">{item.name}</span>,
      kind: item.kind === 'folder' ? 'Folder' : 'Document',
      updated: formatUpdated(item.updated_at),
      actions: (
        <span className="practice-docs__actions">
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
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              event.stopPropagation()
              removeItem(item)
            }}
          >
            Delete
          </button>
        </span>
      ),
    },
  }))

  const editing = selectedId != null

  const editor = (
    <div className="record-editor split-layout__main split-layout__main--doc">
      <div className="doc-meta-fields">
        <div className="form-group doc-meta-fields__title">
          <label htmlFor="practice-doc-name">Name</label>
          <input
            id="practice-doc-name"
            className="paper-input doc-meta-fields__title-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
      title={editing ? (name.trim() || 'Document') : (folder?.name || 'My Documents')}
      newLabel={editing ? undefined : 'document'}
      onNew={editing ? undefined : startDocument}
      headerActions={editing ? (
        <>
          <button type="button" className="secondary" onClick={() => { setEditorOpen?.(false); setSelectedId(null) }}>Back</button>
          <button type="button" className="primary" onClick={saveDocument} disabled={mutate.isPending}>
            {mutate.isPending ? 'Saving…' : 'Save document'}
          </button>
        </>
      ) : (
        <button type="button" className="secondary" onClick={createFolder}>New folder</button>
      )}
      editor={editing ? editor : undefined}
    >
      {!editing && crumbs.length > 0 && (
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
      {!editing && error && (
        <p className="text-muted">{error.message || 'Could not load documents.'}</p>
      )}
      {!editing && !error && (
        <RecordTable
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
