import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfirm, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { CLIENT_BINDS, bindLabel, blankForm, moveListItem, newFormId } from '../../lib/formModel'
import {
  useDeleteFormMutation,
  useFormsQuery,
  useMeasuresQuery,
  useSaveFormMutation,
} from '../../lib/formQueries'
import { formStartUrl } from '../forms/downloadCsv'

const BLOCK_TYPES = [
  { value: 'short_text', label: 'Short answer' },
  { value: 'long_text', label: 'Longer answer' },
  { value: 'yes_no', label: 'Yes or no' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
  { value: 'client', label: 'Client detail' },
  { value: 'measure', label: 'Questionnaire' },
]

function blockOfType(type, measures) {
  const id = newFormId()
  if (type === 'choice') return { id, type, label: '', required: false, options: ['', ''] }
  if (type === 'client') return { id, type: 'client', bind: 'first_name', label: 'First name', required: false }
  if (type === 'measure') {
    const measure = measures[0]
    return { id, type: 'measure', measureId: measure?.id || '', label: measure?.name || '' }
  }
  return { id, type, label: '', required: false }
}

function blankDraft() {
  return {
    id: null,
    name: '',
    audience: 'private',
    status: 'draft',
    schema: blankForm(),
  }
}

function fromRecord(form) {
  return {
    id: form.id,
    name: form.name,
    audience: form.audience === 'public' ? 'public' : 'private',
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

function FormDesigner({ draft, onChange, measures, userId }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const save = useSaveFormMutation(userId)
  const remove = useDeleteFormMutation(userId)
  const schema = draft.schema
  const published = draft.status === 'published'
  const publishedMeasures = measures.filter((measure) => measure.status === 'published')

  const setBlocks = (blocks) => onChange({ ...draft, schema: { ...schema, blocks } })
  const setBlock = (index, block) => setBlocks(schema.blocks.map((row, rowIndex) => (
    rowIndex === index ? block : row
  )))

  const persist = async (publish) => {
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        audience: draft.audience,
        schema,
        publish,
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
  const embed = link
    ? `<iframe src="${link}" title="${draft.name.replace(/"/g, '')}" style="width:100%;min-height:720px;border:0"></iframe>`
    : ''

  return (
    <div className="form-designer">
      <div className="form-designer__bar">
        <button type="button" className="secondary" onClick={() => navigate('/settings/forms')}>Back</button>
        <h1>{draft.name.trim() || 'New form'}</h1>
        <span className={`badge ${published ? 'badge-green' : 'badge-grey'}`}>
          {published ? 'Published' : 'Draft'}
        </span>
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
          <p className="form-designer__palette-title">Add a question</p>
          {BLOCK_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              className="secondary"
              onClick={() => setBlocks([...schema.blocks, blockOfType(type.value, publishedMeasures)])}
            >
              {type.label}
            </button>
          ))}
          <button type="button" className="danger" onClick={removeDraft} disabled={remove.isPending}>Delete</button>
        </aside>
        <div className="form-designer__canvas">
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
              <label htmlFor="form-audience">Who fills this in</label>
              <select
                id="form-audience"
                className="paper-input"
                value={draft.audience}
                disabled={Boolean(draft.id)}
                onChange={(event) => onChange({
                  ...draft,
                  audience: event.target.value === 'public' ? 'public' : 'private',
                })}
              >
                <option value="private">A client I already see</option>
                <option value="public">Someone new, from a link or my website</option>
              </select>
            </div>
            <p className="form-export-note">
              {draft.audience === 'public'
                ? 'A new person who sends this becomes a client, with a first course. Publish it when it is ready to share.'
                : 'Send a published form from this list, or from the client’s course. A draft cannot be sent.'}
            </p>
          </div>
          {schema.blocks.map((block, index) => (
            <div key={block.id} className="form-designer__card">
              <div className="form-designer__card-head">
                <strong>{BLOCK_TYPES.find((type) => type.value === block.type)?.label || 'Question'}</strong>
                {block.type !== 'measure' && (
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
              <div className="form-group">
                <label htmlFor={`block-type-${block.id}`}>Type</label>
                <select
                  id={`block-type-${block.id}`}
                  className="paper-input"
                  value={block.type}
                  onChange={(event) => {
                    const next = blockOfType(event.target.value, publishedMeasures)
                    setBlock(index, { ...next, id: block.id, label: block.label || next.label })
                  }}
                >
                  {BLOCK_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              {block.type !== 'measure' && (
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
              {block.type === 'client' && (
                <div className="form-group">
                  <label htmlFor={`block-bind-${block.id}`}>Client detail</label>
                  <select
                    id={`block-bind-${block.id}`}
                    className="paper-input"
                    value={block.bind}
                    onChange={(event) => {
                      const bind = CLIENT_BINDS.find((row) => row.key === event.target.value)?.key || 'first_name'
                      setBlock(index, { ...block, bind, label: bindLabel(bind) })
                    }}
                  >
                    {CLIENT_BINDS.map((row) => (
                      <option key={row.key} value={row.key}>{row.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {block.type === 'measure' && (
                <div className="form-group">
                  <label htmlFor={`block-measure-${block.id}`}>Questionnaire</label>
                  <select
                    id={`block-measure-${block.id}`}
                    className="paper-input"
                    value={block.measureId}
                    onChange={(event) => {
                      const measure = measures.find((row) => row.id === event.target.value)
                      setBlock(index, {
                        ...block,
                        measureId: event.target.value,
                        label: measure?.name || block.label,
                      })
                    }}
                  >
                    <option value="">Choose a published questionnaire…</option>
                    {measures.filter((measure) => measure.status === 'published' || measure.id === block.measureId).map((measure) => (
                      <option key={measure.id} value={measure.id}>
                        {measure.name}{measure.status === 'published' ? '' : ' (draft)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-designer__card-actions">
                <button type="button" className="secondary" disabled={index === 0} onClick={() => setBlocks(moveListItem(schema.blocks, index, index - 1))}>Up</button>
                <button type="button" className="secondary" disabled={index === schema.blocks.length - 1} onClick={() => setBlocks(moveListItem(schema.blocks, index, index + 1))}>Down</button>
                <button type="button" className="secondary" onClick={() => setBlocks(schema.blocks.filter((_, blockIndex) => blockIndex !== index))}>Remove</button>
              </div>
            </div>
          ))}
          {!schema.blocks.length && (
            <p className="text-muted">Add a question from the list on the left.</p>
          )}
          {link && (
            <div className="form-designer__card form-share">
              <p>Share this link, or place it on your website. Each person gets their own saved copy.</p>
              <input className="paper-input" readOnly value={link} aria-label="Public form link" />
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => copy(link, 'Link copied')}>Copy link</button>
                <button type="button" className="secondary" onClick={() => copy(embed, 'Website code copied')}>Copy website code</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
