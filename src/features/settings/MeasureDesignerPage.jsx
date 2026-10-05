import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfirm, useToast } from '../../components/ui'
import HelpTip from '../../components/HelpTip'
import { useAuth } from '../../lib/auth/AuthProvider'
import { blankMeasure, measureScoresCsv, moveListItem, newFormId } from '../../lib/formModel'
import {
  useDeleteMeasureMutation,
  useMeasuresQuery,
  useSaveMeasureMutation,
} from '../../lib/formQueries'
import { listMeasureScores } from '../../lib/supabase/formsRepo'
import { downloadCsv } from '../forms/downloadCsv'

function blankDraft() {
  return {
    id: null,
    name: '',
    status: 'draft',
    has_scores: false,
    schema: blankMeasure('items'),
  }
}

function fromRecord(measure) {
  return {
    id: measure.id,
    name: measure.name,
    status: measure.status === 'published' ? 'published' : 'draft',
    has_scores: Boolean(measure.has_scores),
    schema: measure.schema,
  }
}

export default function MeasureDesignerPage() {
  const { measureId } = useParams()
  const isNew = !measureId || measureId === 'new'
  const { user } = useAuth()
  const userId = user?.id || ''
  const measuresQuery = useMeasuresQuery(userId)
  const existing = (measuresQuery.data || []).find((measure) => measure.id === measureId)
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

  if (!isNew && measuresQuery.isPending && !existing) {
    return <p className="text-muted">Opening the questionnaire…</p>
  }
  if (!isNew && !measuresQuery.isPending && !existing && tracked !== measureId) {
    return <p className="text-muted">This questionnaire is not in your list.</p>
  }

  return (
    <MeasureDesigner
      draft={draft}
      onChange={setDraft}
      userId={userId}
    />
  )
}

function MeasureDesigner({ draft, onChange, userId }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const save = useSaveMeasureMutation(userId)
  const remove = useDeleteMeasureMutation(userId)
  const schema = draft.schema
  const locked = Boolean(draft.has_scores)
  const published = draft.status === 'published'

  const setSchema = (next) => onChange({ ...draft, schema: next })

  const persist = async (publish) => {
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        schema,
        publish,
      })
      onChange(fromRecord(saved))
      if (!draft.id) navigate(`/settings/forms/questionnaires/${saved.id}`, { replace: true })
      toast.saved(publish || saved.status === 'published' ? (published ? 'Questionnaire saved' : 'Questionnaire published') : 'Draft saved')
    } catch (err) {
      toast.error(err.message || 'Could not save the questionnaire')
    }
  }

  const download = async () => {
    if (!draft.id) {
      toast.error('Save the questionnaire before downloading scores.')
      return
    }
    try {
      const pack = await listMeasureScores(draft.id)
      if (!pack.rows.length) {
        toast.error('No scores yet.')
        return
      }
      downloadCsv(`${pack.slug || 'scores'}.csv`, measureScoresCsv(pack.schema, pack.rows))
    } catch (err) {
      toast.error(err.message || 'Could not download scores')
    }
  }

  const removeDraft = async () => {
    if (!draft.id) {
      navigate('/settings/forms')
      return
    }
    const ok = await confirm({
      title: 'Delete this questionnaire?',
      message: 'This removes it from your list.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(draft.id)
      toast.saved('Questionnaire deleted')
      navigate('/settings/forms')
    } catch (err) {
      toast.error(err.message || 'Could not delete the questionnaire')
    }
  }

  return (
    <div className="form-designer">
      <div className="form-designer__bar">
        <button type="button" className="secondary" onClick={() => navigate('/settings/forms')}>Back</button>
        <h1>{draft.name.trim() || 'New questionnaire'}</h1>
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
          <div className="form-designer__palette-head">
            <p className="form-designer__palette-title">Scale</p>
            <HelpTip
              text="A few statements, each scored the same, suits something like YP-CORE. One overall score suits something like CGAS."
              label="About the scale"
            />
          </div>
          {schema.kind === 'items' && !locked && (
            <button
              type="button"
              className="secondary"
              onClick={() => setSchema({
                ...schema,
                items: [...schema.items, { id: newFormId(), label: '' }],
              })}
            >
              Add statement
            </button>
          )}
          <button type="button" className="secondary" onClick={download}>Download scores</button>
          <button type="button" className="danger" onClick={removeDraft} disabled={remove.isPending}>Delete</button>
        </aside>
        <div className="form-designer__canvas">
          <div className="form-designer__card">
            <label htmlFor="measure-name">Name</label>
            <input
              id="measure-name"
              className="paper-input"
              value={draft.name}
              placeholder="YP-CORE, CGAS, or a scale of your own"
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="form-designer__card">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="measure-kind">How it is scored</label>
                <select
                  id="measure-kind"
                  className="paper-input"
                  value={schema.kind}
                  disabled={locked}
                  onChange={(event) => {
                    const kind = event.target.value === 'overall' ? 'overall' : 'items'
                    if (kind === 'overall') setSchema({ ...schema, kind, items: [] })
                    else setSchema({
                      ...schema,
                      kind,
                      items: schema.items.length ? schema.items : [{ id: newFormId(), label: '' }],
                    })
                  }}
                >
                  <option value="items">Several statements, each scored the same</option>
                  <option value="overall">One overall score</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="measure-min">Lowest score</label>
                <input
                  id="measure-min"
                  className="paper-input"
                  type="number"
                  value={schema.min}
                  disabled={locked}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isInteger(next)) setSchema({ ...schema, min: next })
                  }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="measure-max">Highest score</label>
                <input
                  id="measure-max"
                  className="paper-input"
                  type="number"
                  value={schema.max}
                  disabled={locked}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isInteger(next)) setSchema({ ...schema, max: next })
                  }}
                />
              </div>
            </div>
          </div>
          {locked && (
            <p className="form-export-note">
              Scores are already saved. You can change the wording. To use a different scale, add a new questionnaire.
            </p>
          )}
          {schema.kind === 'items' && schema.items.map((item, index) => (
            <div key={item.id} className="form-designer__card">
              <label htmlFor={`statement-${item.id}`}>Statement {index + 1}</label>
              <input
                id={`statement-${item.id}`}
                className="paper-input"
                value={item.label}
                placeholder="I have felt edgy or nervous"
                onChange={(event) => setSchema({
                  ...schema,
                  items: schema.items.map((row, rowIndex) => (
                    rowIndex === index ? { ...row, label: event.target.value } : row
                  )),
                })}
              />
              <div className="form-designer__card-actions">
                <button type="button" className="secondary" disabled={locked || index === 0} onClick={() => setSchema({ ...schema, items: moveListItem(schema.items, index, index - 1) })}>Up</button>
                <button type="button" className="secondary" disabled={locked || index === schema.items.length - 1} onClick={() => setSchema({ ...schema, items: moveListItem(schema.items, index, index + 1) })}>Down</button>
                <button
                  type="button"
                  className="secondary"
                  disabled={locked}
                  onClick={() => setSchema({
                    ...schema,
                    items: schema.items.filter((_, itemIndex) => itemIndex !== index),
                  })}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <p className="form-export-note">
            Download a spreadsheet of each completion: the date, the client, date of birth, gender, the total, and each statement.
            Check it against the published tables for this questionnaire, including typical clinical and non-clinical scores.
            Publish it when the wording is ready. Only a published questionnaire can be put on a form or scored from a course.
          </p>
        </div>
      </div>
    </div>
  )
}
