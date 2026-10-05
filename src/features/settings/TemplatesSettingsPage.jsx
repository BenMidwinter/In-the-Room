import { useMemo, useState } from 'react'
import RecordTable from '../../components/RecordTable'
import RichTextEditor from '../../components/RichTextEditor'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { useToast, useConfirm } from '../../components/ui'
import {
  useDeleteTemplateMutation,
  useSaveTemplateMutation,
  useTemplatesQuery,
} from '../../lib/templateQueries'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { useAuth } from '../../lib/auth/AuthProvider'
import { formatDisplayDate } from '../../lib/dateArchitecture'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { getProfile } from '../../lib/store'
import DocumentWorkspace from '../client/DocumentWorkspace'

export default function TemplatesSettingsPage({ kind, title }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile: accountProfile, user } = useAuth()
  const { data: templates = [], isPending, error } = useTemplatesQuery(kind)
  const saveTemplate = useSaveTemplateMutation(kind)
  const removeTemplate = useDeleteTemplateMutation(kind)
  const [selectedId, setSelectedId] = useState(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [version, setVersion] = useState(0)

  const clinicianProfile = useMemo(
    () => clinicianProfileForEditor(accountProfile, user ? getProfile(user.id) : null),
    [accountProfile, user],
  )
  const mergeContext = useMemo(
    () => buildMergeContext({ profile: clinicianProfile }),
    [clinicianProfile],
  )

  const openNew = () => {
    setSelectedId('new')
    setName('')
    setContent('<p></p>')
    setVersion((value) => value + 1)
  }

  const openExisting = (template) => {
    setSelectedId(template.id)
    setName(template.name)
    setContent(template.content || '<p></p>')
    setVersion((value) => value + 1)
  }

  const save = async () => {
    try {
      const saved = await saveTemplate.mutateAsync({
        id: selectedId,
        kind,
        name,
        content,
      })
      setSelectedId(saved.id)
      setName(saved.name)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not save the template')
    }
  }

  const remove = async (id) => {
    const templateId = id || selectedId
    if (!templateId || templateId === 'new') {
      setSelectedId(null)
      return
    }
    const ok = await confirm({
      title: 'Delete this template?',
      message: 'Notes and letters already written from it stay as they are.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeTemplate.mutateAsync(templateId)
      if (selectedId === templateId) setSelectedId(null)
      toast.saved('Template deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete the template')
    }
  }

  const editing = selectedId != null

  if (editing) {
    return (
      <DocumentWorkspace
        title={name.trim() || title}
        onBack={() => setSelectedId(null)}
        actions={(
          <>
            <button type="button" className="secondary" onClick={() => remove(selectedId)} disabled={removeTemplate.isPending}>
              Delete
            </button>
            <button type="button" className="primary" onClick={save} disabled={saveTemplate.isPending}>
              {saveTemplate.isPending ? 'Saving…' : 'Save template'}
            </button>
          </>
        )}
        meta={(
          <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
            <span className="progress-notes-page__meta-label">Name</span>
            <input
              className="progress-notes-page__meta-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. First session"
            />
          </label>
        )}
      >
        <RichTextEditor
          key={`${selectedId}-${version}`}
          content={content}
          onChange={setContent}
          layout="immersive"
          variant="a4"
          mode="clinical"
          mergeMode="template"
          mergeContext={mergeContext}
          clinicianProfile={clinicianProfile}
        />
      </DocumentWorkspace>
    )
  }

  const rows = templates.map((template) => ({
    id: template.id,
    template,
    filterValues: { name: template.name },
    sortValues: { name: template.name, updated: template.updated_at || '' },
    cells: {
      name: <span className="record-table__primary">{template.name}</span>,
      updated: formatDisplayDate(String(template.updated_at || '').slice(0, 10)) || '—',
      actions: (
        <div className="record-table__row-actions">
          <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); openExisting(template) }}>Edit</button>
          <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); remove(template.id) }} disabled={removeTemplate.isPending}>
            Delete
          </button>
        </div>
      ),
    },
  }))

  return (
    <div className="section-card-stack">
      <SettingsSectionCard
        blockId={`settings_templates_${kind}`}
        title={title}
        actions={(
          <button type="button" className="secondary" onClick={openNew}>Add a template</button>
        )}
      >
        {!isSupabaseConfigured() && (
          <p className="auth-page__alert">Supabase env vars required to keep templates.</p>
        )}
        {error && <p className="auth-page__alert">{error.message}</p>}
        <RecordTable
          columns={[
            { key: 'name', label: 'Name', filter: 'text', sort: 'text' },
            { key: 'updated', label: 'Updated', sort: 'date' },
            { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
          ]}
          rows={rows}
          countNoun="templates"
          emptyMessage={isPending ? 'Loading templates…' : 'No templates yet.'}
          onRowClick={(row) => openExisting(row.template)}
        />
      </SettingsSectionCard>
    </div>
  )
}
