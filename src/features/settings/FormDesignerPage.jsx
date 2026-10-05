import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import FormOverlay from '../../components/FormOverlay'
import { useConfirm, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { CLIENT_BINDS, bindLabel, blankForm, moveListItem, newFormId } from '../../lib/formModel'
import {
  useDeleteFormMutation,
  useFormsQuery,
  useMeasuresQuery,
  useSaveFormMutation,
} from '../../lib/formQueries'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import { formEmbedCode, formStartUrl } from '../forms/downloadCsv'

const FORM_MODULES = [
  { kind: 'prose', label: 'Text' },
  { kind: 'field', type: 'short_text', label: 'Short answer' },
  { kind: 'field', type: 'long_text', label: 'Longer answer' },
  { kind: 'field', type: 'yes_no', label: 'Yes or no' },
  { kind: 'field', type: 'date', label: 'Date' },
  { kind: 'field', type: 'choice', label: 'Choice' },
]

function blockFromSpec(spec) {
  const id = newFormId()
  if (spec.kind === 'prose') return [{ id, type: 'prose', text: '' }]
  if (spec.kind === 'client') {
    return [{ id, type: 'client', bind: spec.bind, label: bindLabel(spec.bind), required: false }]
  }
  if (spec.kind === 'clients') {
    return CLIENT_BINDS.map((row) => ({
      id: newFormId(),
      type: 'client',
      bind: row.key,
      label: row.label,
      required: false,
    }))
  }
  if (spec.kind === 'measure') {
    return [{ id, type: 'measure', measureId: spec.measureId, label: spec.name }]
  }
  if (spec.type === 'choice') return [{ id, type: 'choice', label: '', required: false, options: ['', ''] }]
  return [{ id, type: spec.type, label: '', required: false }]
}

function moduleTitle(block) {
  if (block.type === 'prose') return 'Text'
  if (block.type === 'client') return bindLabel(block.bind)
  if (block.type === 'measure') return block.label || 'Questionnaire'
  return FORM_MODULES.find((row) => row.type === block.type)?.label || 'Question'
}

function readDrag(event) {
  try {
    return JSON.parse(event.dataTransfer.getData('text/plain'))
  } catch {
    return null
  }
}

function blankDraft() {
  return {
    id: null,
    name: '',
    audience: 'private',
    placeOnScreener: false,
    autofillClient: true,
    letterheadId: undefined,
    status: 'draft',
    schema: blankForm(),
  }
}

function fromRecord(form) {
  return {
    id: form.id,
    name: form.name,
    audience: form.audience === 'public' ? 'public' : 'private',
    placeOnScreener: Boolean(form.place_on_screener),
    autofillClient: form.autofill_client !== false,
    letterheadId: form.letterhead_id || null,
    status: form.status === 'published' ? 'published' : 'draft',
    schema: form.schema,
  }
}

export default function FormDesignerPage() {
  const { formId } = useParams()
  const isNew = !formId || formId === 'new'
  const { user } = useAuth()
  const userId = user?.id || ''
  const formsQuery = useFormsQuery(userId)
  const measuresQuery = useMeasuresQuery(userId)
  const existing = (formsQuery.data || []).find((form) => form.id === formId)
  const [tracked, setTracked] = useState(null)
  const [draft, setDraft] = useState(blankDraft)

  if (isNew) {
    if (tracked !== 'new') {
      setTracked('new')
      setDraft(blankDraft())
    }
  } else if (existing && tracked !== existing.id) {
    setTracked(existing.id)
    setDraft(fromRecord(existing))
  }

  if (!isNew && formsQuery.isPending && !existing) {
    return <p className="text-muted">Opening the form…</p>
  }
  if (!isNew && !formsQuery.isPending && !existing && tracked !== formId) {
    return <p className="text-muted">This form is not in your list.</p>
  }

  return (
    <FormDesigner
      draft={draft}
      onChange={setDraft}
      measures={measuresQuery.data || []}
      userId={userId}
    />
  )
}

function PaletteButton({ spec, onAdd }) {
  return (
    <button
      type="button"
      className="secondary form-designer__module"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', JSON.stringify({ palette: spec }))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onAdd(spec)}
    >
      {spec.label}
    </button>
  )
}

function SettingsWheel() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.13.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  )
}

function FormSettings({ draft, onChange, onClose }) {
  const screenerLocked = Boolean(draft.id) && draft.audience !== 'public'
  const autofillLocked = draft.audience === 'public'
  return (
    <FormOverlay
      title="Form settings"
      eyebrow={draft.name.trim() || 'New form'}
      meta="These apply when you save the form."
      size="sm"
      onClose={onClose}
      footer={(
        <div className="form-actions">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      )}
    >
      <div className="form-group">
        <label htmlFor="form-screener">Place the person on the screener</label>
        <select
          id="form-screener"
          className="paper-input"
          value={draft.placeOnScreener ? 'yes' : 'no'}
          disabled={screenerLocked}
          onChange={(event) => {
            const yes = event.target.value === 'yes'
            onChange({
              ...draft,
              placeOnScreener: yes,
              audience: yes && !draft.id ? 'public' : draft.audience,
            })
          }}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
        <p className="form-designer__hint">
          {draft.audience === 'public'
            ? 'Yes creates the client, opens a course, and puts them on the screener when they send the form.'
            : screenerLocked
              ? 'A shared form places someone new on the screener. This form is sent to a client you already see.'
              : 'Yes shares this form as a link. Someone new who sends it is added to the screener.'}
        </p>
      </div>
      <div className="form-group">
        <label htmlFor="form-autofill">Auto fill client details</label>
        <select
          id="form-autofill"
          className="paper-input"
          value={autofillLocked || draft.autofillClient === false ? 'no' : 'yes'}
          disabled={autofillLocked}
          onChange={(event) => onChange({ ...draft, autofillClient: event.target.value === 'yes' })}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        <p className="form-designer__hint">
          {autofillLocked
            ? 'Name, date of birth, and the other profile fields already on the form are filled in when you send a form to a client you already see.'
            : 'Name, date of birth, and the other profile fields already on the form are filled in when you send it.'}
        </p>
      </div>
      <fieldset className="form-group" disabled>
        <legend>Email notification</legend>
        <label className="form-builder__required">
          <input type="checkbox" disabled />
          Email me when someone sends this form
        </label>
        <p className="form-designer__hint">This is not available yet.</p>
      </fieldset>
    </FormOverlay>
  )
}

function FormDesigner({ draft, onChange, measures, userId }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const save = useSaveFormMutation(userId)
  const remove = useDeleteFormMutation(userId)
  const letterheadsQuery = useQuery({
    queryKey: ['letterheads', userId],
    queryFn: listLetterheads,
    enabled: Boolean(userId),
  })
  const letterheads = letterheadsQuery.data || []
  const letterheadId = draft.letterheadId === undefined
    ? (letterheads.find((row) => row.is_default)?.id || letterheads[0]?.id || '')
    : (draft.letterheadId || '')
  const schema = draft.schema
  const published = draft.status === 'published'
  const publishedMeasures = measures.filter((measure) => measure.status === 'published')

  const setBlocks = (blocks) => onChange({ ...draft, schema: { ...schema, blocks } })
  const setBlock = (index, block) => setBlocks(schema.blocks.map((row, rowIndex) => (
    rowIndex === index ? block : row
  )))

  const addSpec = (spec, index = schema.blocks.length) => {
    let incoming = blockFromSpec(spec)
    if (spec.kind === 'clients') {
      const present = new Set(schema.blocks.filter((block) => block.type === 'client').map((block) => block.bind))
      incoming = incoming.filter((block) => !present.has(block.bind))
      if (!incoming.length) {
        toast.saved('Those client details are already on the form')
        return
      }
    }
    const next = schema.blocks.slice()
    next.splice(index, 0, ...incoming)
    setBlocks(next)
  }

  const dropAt = (event, index) => {
    event.preventDefault()
    event.stopPropagation()
    const payload = readDrag(event)
    if (!payload) return
    if (payload.palette) addSpec(payload.palette, index)
    else if (Number.isInteger(payload.index)) setBlocks(moveListItem(schema.blocks, payload.index, Math.min(index, schema.blocks.length - 1)))
  }

  const persist = async (publish) => {
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        audience: draft.audience,
        schema,
        publish,
        placeOnScreener: draft.audience === 'public' && draft.placeOnScreener,
        autofillClient: draft.autofillClient !== false,
        letterheadId: letterheadId || null,
      })
      onChange(fromRecord(saved))
      if (!draft.id) navigate(`/settings/forms/edit/${saved.id}`, { replace: true })
      toast.saved(publish || saved.status === 'published' ? (published ? 'Form saved' : 'Form published') : 'Draft saved')
    } catch (err) {
      toast.error(err.message || 'Could not save the form')
    }
  }

  const removeDraft = async () => {
    if (!draft.id) {
      navigate('/settings/forms')
      return
    }
    const ok = await confirm({
      title: 'Delete this form?',
      message: 'If it has already been used, it is archived and the answers stay on the course.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const result = await remove.mutateAsync(draft.id)
      toast.saved(result === 'archived'
        ? 'This form has been used, so it is archived. Answers already collected stay on the course.'
        : 'Form deleted')
      navigate('/settings/forms')
    } catch (err) {
      toast.error(err.message || 'Could not delete the form')
    }
  }

  const copy = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.saved(message)
    } catch (err) {
      toast.error(err.message || 'Could not copy')
    }
  }

  const link = draft.id && published && draft.audience === 'public' ? formStartUrl(draft.id) : ''
  const embed = link ? formEmbedCode(draft.id, draft.name) : ''

  return (
    <div className="form-designer">
      <div className="form-designer__bar">
        <button type="button" className="secondary" onClick={() => navigate('/settings/forms')}>Back</button>
        <h1>{draft.name.trim() || 'New form'}</h1>
        <span className={`badge ${published ? 'badge-green' : 'badge-grey'}`}>
          {published ? 'Published' : 'Draft'}
        </span>
        <button type="button" className="secondary form-designer__settings" onClick={() => setSettingsOpen(true)}>
          <SettingsWheel />
          Settings
        </button>
        {!published && (
          <button type="button" className="secondary" onClick={() => persist(false)} disabled={save.isPending}>
            Save draft
          </button>
        )}
        <button type="button" className="primary" onClick={() => persist(true)} disabled={save.isPending}>
          {published ? 'Save' : 'Publish'}
        </button>
      </div>
      <div className="form-designer__layout">
        <aside className="form-designer__palette">
          <p className="form-designer__palette-title">Form modules</p>
          {FORM_MODULES.map((spec) => (
            <PaletteButton key={spec.label} spec={spec} onAdd={addSpec} />
          ))}
          <p className="form-designer__palette-title">Client modules</p>
          <PaletteButton spec={{ kind: 'clients', label: 'All client details' }} onAdd={addSpec} />
          {CLIENT_BINDS.map((row) => (
            <PaletteButton key={row.key} spec={{ kind: 'client', bind: row.key, label: row.label }} onAdd={addSpec} />
          ))}
          <p className="form-designer__palette-title">Outcome modules</p>
          {publishedMeasures.length ? publishedMeasures.map((measure) => (
            <PaletteButton
              key={measure.id}
              spec={{ kind: 'measure', measureId: measure.id, name: measure.name, label: measure.name }}
              onAdd={addSpec}
            />
          )) : (
            <p className="text-small text-muted">Publish a questionnaire and it will appear here.</p>
          )}
          <button type="button" className="danger" onClick={removeDraft} disabled={remove.isPending}>Delete</button>
        </aside>
        <div
          className="form-designer__canvas"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropAt(event, schema.blocks.length)}
        >
          <div className="form-designer__card">
            <label htmlFor="form-name">Form name</label>
            <input
              id="form-name"
              className="paper-input"
              value={draft.name}
              placeholder="YP-CORE, consent, or a form of your own"
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
            <div className="form-group" style={{ marginTop: '0.8rem' }}>
              <label htmlFor="form-audience">What this form is for</label>
              <select
                id="form-audience"
                className="paper-input"
                value={draft.audience}
                disabled={Boolean(draft.id)}
                onChange={(event) => {
                  const audience = event.target.value === 'public' ? 'public' : 'private'
                  onChange({
                    ...draft,
                    audience,
                    placeOnScreener: audience === 'public' ? draft.placeOnScreener : false,
                  })
                }}
              >
                <option value="private">Send to a client I already see</option>
                <option value="public">Share a link</option>
              </select>
            </div>
            <div className="form-group" style={{ marginTop: '0.8rem' }}>
              <label htmlFor="form-letterhead">Letterhead</label>
              <select
                id="form-letterhead"
                className="paper-input"
                value={letterheadId}
                onChange={(event) => onChange({ ...draft, letterheadId: event.target.value || null })}
              >
                <option value="">No letterhead</option>
                {letterheads.map((row) => (
                  <option key={row.id} value={row.id}>{row.name || row.practice_name || 'Letterhead'}</option>
                ))}
              </select>
            </div>
            <p className="form-export-note">
              {draft.audience === 'public'
                ? 'Publish this, then copy the link or the embed from the forms list. The letterhead sits at the top of the form and the PDF.'
                : 'Add a published form from the client’s course. A draft cannot be added there.'}
              {' '}
              The settings wheel holds the screener, auto fill, and email notification.
            </p>
          </div>
          {settingsOpen ? (
            <FormSettings draft={draft} onChange={onChange} onClose={() => setSettingsOpen(false)} />
          ) : null}
          {schema.blocks.map((block, index) => (
            <div
              key={block.id}
              className="form-designer__card"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', JSON.stringify({ index }))
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropAt(event, index)}
            >
              <div className="form-designer__card-head">
                <strong>{moduleTitle(block)}</strong>
                {block.type !== 'measure' && block.type !== 'prose' && (
                  <label className="form-builder__required">
                    <input
                      type="checkbox"
                      checked={Boolean(block.required)}
                      onChange={(event) => setBlock(index, { ...block, required: event.target.checked })}
                    />
                    Required
                  </label>
                )}
              </div>
              {block.type === 'prose' && (
                <div className="form-group">
                  <label htmlFor={`block-text-${block.id}`}>Section text</label>
                  <textarea
                    id={`block-text-${block.id}`}
                    className="paper-input"
                    rows={4}
                    value={block.text}
                    placeholder="Say what this form is for, or introduce the next questions."
                    onChange={(event) => setBlock(index, { ...block, text: event.target.value })}
                  />
                </div>
              )}
              {block.type !== 'prose' && block.type !== 'measure' && (
                <div className="form-group">
                  <label htmlFor={`block-label-${block.id}`}>Question</label>
                  <input
                    id={`block-label-${block.id}`}
                    className="paper-input"
                    value={block.label}
                    onChange={(event) => setBlock(index, { ...block, label: event.target.value })}
                  />
                </div>
              )}
              {block.type === 'choice' && (
                <div className="form-group">
                  <label htmlFor={`block-options-${block.id}`}>Choices, one on each line</label>
                  <textarea
                    id={`block-options-${block.id}`}
                    className="paper-input"
                    rows={3}
                    value={block.options.join('\n')}
                    onChange={(event) => setBlock(index, { ...block, options: event.target.value.split('\n') })}
                  />
                </div>
              )}
              {block.type === 'measure' && (
                <p className="text-small text-muted" style={{ margin: 0 }}>
                  This questionnaire is scored when the form is sent.
                </p>
              )}
              <div className="form-designer__card-actions">
                <div className="form-designer__nudge">
                  <button type="button" className="secondary" aria-label="Move up" disabled={index === 0} onClick={() => setBlocks(moveListItem(schema.blocks, index, index - 1))}>↑</button>
                  <button type="button" className="secondary" aria-label="Move down" disabled={index === schema.blocks.length - 1} onClick={() => setBlocks(moveListItem(schema.blocks, index, index + 1))}>↓</button>
                </div>
                <button type="button" className="secondary" onClick={() => setBlocks(schema.blocks.filter((_, blockIndex) => blockIndex !== index))}>Remove</button>
              </div>
            </div>
          ))}
          {!schema.blocks.length && (
            <p className="text-muted">Drag a module here, or click one on the left.</p>
          )}
          {link && (
            <div className="form-designer__card form-share">
              <p>This intake form is published. Copy the link, or the embed, from the forms list.</p>
              <input className="paper-input" readOnly value={link} aria-label="Intake form link" />
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => copy(link, 'Link copied')}>Copy link</button>
                <button type="button" className="secondary" onClick={() => copy(embed, 'Embed code copied')}>Copy embed code</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
