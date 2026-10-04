import { useMemo, useState } from 'react'
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

  const remove = async () => {
    if (!selectedId || selectedId === 'new') {
      setSelectedId(null)
      return
    }
    const ok = await confirm({
      title: 'Delete this template?',
      message: 'Notes and letters already written from it stay as they are.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await removeTemplate.mutateAsync(selectedId)
      setSelectedId(null)
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
            <button type="button" className="secondary" onClick={remove} disabled={removeTemplate.isPending}>
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

  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId={`settings_templates_${kind}`} title={title}>
        {!isSupabaseConfigured() && (
          <p className="auth-page__alert">Supabase env vars required to keep templates.</p>
        )}
        {error && <p className="auth-page__alert">{error.message}</p>}

        <div className="template-studio__list" role="list">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              role="listitem"
              className={`section-card__toolbar-item${selectedId === template.id ? ' section-card__toolbar-item--active' : ''}`}
              onClick={() => openExisting(template)}
            >
              {template.name}
            </button>
          ))}
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + New template
          </button>
        </div>

        {isPending && <p className="text-small text-muted">Loading templates…</p>}
        {!isPending && templates.length === 0 && (
          <p className="text-muted" style={{ margin: 0 }}>No templates yet.</p>
        )}
      </SettingsSectionCard>
    </div>
  )
}
