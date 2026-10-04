import { useState } from 'react'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import {
  CLIENT_BINDS,
  bindLabel,
  blankForm,
  blankMeasure,
  measureScoresCsv,
  moveListItem,
  newFormId,
} from '../../lib/formModel'
import {
  useDeleteFormMutation,
  useDeleteMeasureMutation,
  useFormsQuery,
  useMeasuresQuery,
  useSaveFormMutation,
  useSaveMeasureMutation,
} from '../../lib/formQueries'
import { listMeasureScores } from '../../lib/supabase/formsRepo'
import { downloadCsv, formStartUrl } from '../forms/downloadCsv'
import { SettingsSectionCard } from './SettingsPlaceholders'

const BLOCK_TYPES = [
  { value: 'short_text', label: 'Short answer' },
  { value: 'long_text', label: 'Longer answer' },
  { value: 'yes_no', label: 'Yes or no' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
  { value: 'client', label: 'Client detail' },
  { value: 'measure', label: 'Questionnaire' },
]

function ExportNote() {
  return (
    <p className="form-export-note">
      Download a spreadsheet of each completion: the date, the client, date of birth, gender, the total, and each statement.
      Check it against the published tables for this questionnaire, including typical clinical and non-clinical scores.
      Add a gender question, using the client detail Gender, when you want that column filled in.
    </p>
  )
}

function MoveButtons({ index, count, locked, onMove, onRemove }) {
  return (
    <div className="form-builder__moves">
      <button type="button" className="secondary" disabled={locked || index === 0} onClick={() => onMove(index, index - 1)}>Up</button>
      <button type="button" className="secondary" disabled={locked || index === count - 1} onClick={() => onMove(index, index + 1)}>Down</button>
      <button type="button" className="secondary" disabled={locked} onClick={() => onRemove(index)}>Remove</button>
    </div>
  )
}

function MeasureEditor({ draft, onChange, onClose, onSaved }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()
  const userId = user?.id || ''
  const save = useSaveMeasureMutation(userId)
  const remove = useDeleteMeasureMutation(userId)
  const schema = draft.schema
  const locked = Boolean(draft.has_scores)

  const setSchema = (next) => onChange({ ...draft, schema: next })

  const saveDraft = async () => {
    try {
      const saved = await save.mutateAsync({ id: draft.id, name: draft.name, schema })
      onSaved(saved)
      toast.saved('Questionnaire saved')
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
      onClose()
      return
    }
    const ok = await confirm({
      title: 'Remove this questionnaire?',
      message: 'This removes it from your list.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(draft.id)
      toast.saved('Questionnaire removed')
      onClose()
    } catch (err) {
      toast.error(err.message || 'Could not remove the questionnaire')
    }
  }

  return (
    <div className="form-builder">
      <div className="form-group">
        <label htmlFor="measure-name">Name</label>
        <input
          id="measure-name"
          className="paper-input"
          value={draft.name}
          placeholder="YP-CORE, CGAS, or a scale of your own"
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
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
      {locked && (
        <p className="form-export-note">
          Scores are already saved. You can change the wording. To use a different scale, add a new questionnaire.
        </p>
      )}
      {schema.kind === 'items' && (
        <div className="form-builder__list">
          <p className="form-question__label">Statements</p>
          {schema.items.map((item, index) => (
            <div
              key={item.id}
              className="form-builder__row"
              draggable={!locked}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index))
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const from = Number(event.dataTransfer.getData('text/plain'))
                setSchema({ ...schema, items: moveListItem(schema.items, from, index) })
              }}
            >
              <input
                className="paper-input"
                value={item.label}
                placeholder="I have felt edgy or nervous"
                aria-label={`Statement ${index + 1}`}
                onChange={(event) => setSchema({
                  ...schema,
                  items: schema.items.map((row, rowIndex) => (
                    rowIndex === index ? { ...row, label: event.target.value } : row
                  )),
                })}
              />
              <MoveButtons
                index={index}
                count={schema.items.length}
                locked={locked}
                onMove={(from, to) => setSchema({ ...schema, items: moveListItem(schema.items, from, to) })}
                onRemove={(rowIndex) => setSchema({
                  ...schema,
                  items: schema.items.filter((_, itemIndex) => itemIndex !== rowIndex),
                })}
              />
            </div>
          ))}
          {!locked && (
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
        </div>
      )}
      <ExportNote />
      <div className="form-actions">
        <button type="button" className="primary" onClick={saveDraft} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={download}>Download scores</button>
        <button type="button" className="secondary" onClick={onClose}>Back</button>
        <button type="button" className="danger" onClick={removeDraft} disabled={remove.isPending}>Remove</button>
      </div>
    </div>
  )
}

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

function FormEditor({ draft, measures, onChange, onClose, onSaved }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()
  const userId = user?.id || ''
  const save = useSaveFormMutation(userId)
  const remove = useDeleteFormMutation(userId)
  const schema = draft.schema

  const setBlocks = (blocks) => onChange({ ...draft, schema: { ...schema, blocks } })
  const setBlock = (index, block) => setBlocks(schema.blocks.map((row, rowIndex) => (
    rowIndex === index ? block : row
  )))

  const saveDraft = async () => {
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        audience: draft.audience,
        schema,
      })
      onSaved(saved)
      toast.saved('Form saved')
    } catch (err) {
      toast.error(err.message || 'Could not save the form')
    }
  }

  const removeDraft = async () => {
    if (!draft.id) {
      onClose()
      return
    }
    const ok = await confirm({
      title: 'Remove this form?',
      message: 'This removes it from your list.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(draft.id)
      toast.saved('Form removed')
      onClose()
    } catch (err) {
      toast.error(err.message || 'Could not remove the form')
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

  const link = draft.id ? formStartUrl(draft.id) : ''
  const embed = link
    ? `<iframe src="${link}" title="${draft.name.replace(/"/g, '')}" style="width:100%;min-height:720px;border:0"></iframe>`
    : ''

  return (
    <div className="form-builder">
      <div className="form-group">
        <label htmlFor="form-name">Name</label>
        <input
          id="form-name"
          className="paper-input"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="form-group">
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
          ? 'A new person who sends this becomes a client, with a first course. Each time a questionnaire on it is completed, a new score is kept.'
          : 'Send this from the client’s Course, under Forms. Each time a questionnaire on it is completed, a new score is kept.'}
      </p>
      <div className="form-builder__list">
        {schema.blocks.map((block, index) => (
          <div
            key={block.id}
            className="form-builder__card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', String(index))
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const from = Number(event.dataTransfer.getData('text/plain'))
              setBlocks(moveListItem(schema.blocks, from, index))
            }}
          >
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor={`block-type-${block.id}`}>Type</label>
                <select
                  id={`block-type-${block.id}`}
                  className="paper-input"
                  value={block.type}
                  onChange={(event) => {
                    const next = blockOfType(event.target.value, measures)
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
            </div>
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
                  <option value="">Choose a questionnaire…</option>
                  {measures.map((measure) => (
                    <option key={measure.id} value={measure.id}>{measure.name}</option>
                  ))}
                </select>
              </div>
            )}
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
            <MoveButtons
              index={index}
              count={schema.blocks.length}
              onMove={(from, to) => setBlocks(moveListItem(schema.blocks, from, to))}
              onRemove={(rowIndex) => setBlocks(schema.blocks.filter((_, blockIndex) => blockIndex !== rowIndex))}
            />
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setBlocks([...schema.blocks, blockOfType('short_text', measures)])}
        >
          Add question
        </button>
      </div>
      {draft.id && draft.audience === 'public' && (
        <div className="form-share">
          <p>Share this link, or place it on your website. Each person gets their own saved copy.</p>
          <input className="paper-input" readOnly value={link} aria-label="Public form link" />
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => copy(link, 'Link copied')}>Copy link</button>
            <button type="button" className="secondary" onClick={() => copy(embed, 'Website code copied')}>Copy website code</button>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="primary" onClick={saveDraft} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onClose}>Back</button>
        <button type="button" className="danger" onClick={removeDraft} disabled={remove.isPending}>Remove</button>
      </div>
    </div>
  )
}

export default function FormsSettingsPage() {
  const { user } = useAuth()
  const userId = user?.id || ''
  const measuresQuery = useMeasuresQuery(userId)
  const formsQuery = useFormsQuery(userId)
  const [measureDraft, setMeasureDraft] = useState(null)
  const [formDraft, setFormDraft] = useState(null)
  const measures = measuresQuery.data || []
  const forms = formsQuery.data || []

  const measureRows = measures.map((measure) => ({
    id: measure.id,
    measure,
    filterValues: { name: measure.name, kind: measure.schema.kind === 'overall' ? 'One score' : 'Statements' },
    sortValues: { name: measure.name },
    cells: {
      name: <span className="record-table__primary">{measure.name}</span>,
      kind: measure.schema.kind === 'overall' ? 'One score' : 'Statements',
    },
  }))

  const formRows = forms.map((form) => ({
    id: form.id,
    form,
    filterValues: {
      name: form.name,
      who: form.audience === 'public' ? 'Someone new' : 'A client I see',
    },
    sortValues: { name: form.name },
    cells: {
      name: <span className="record-table__primary">{form.name}</span>,
      who: form.audience === 'public' ? 'Someone new' : 'A client I see',
    },
  }))

  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId="settings_measures" title="Questionnaires you track">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Name the questionnaire, such as YP-CORE or CGAS. Each time it is completed, the score is kept.
        </p>
        {measureDraft ? (
          <MeasureEditor
            draft={measureDraft}
            onChange={setMeasureDraft}
            onClose={() => setMeasureDraft(null)}
            onSaved={setMeasureDraft}
          />
        ) : (
          <>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setMeasureDraft({ id: null, name: '', schema: blankMeasure('items'), has_scores: false })}
              >
                Add a questionnaire
              </button>
            </div>
            <RecordTable
              columns={[
                { key: 'name', label: 'Questionnaire', filter: 'text', sort: 'text' },
                { key: 'kind', label: 'Scoring', filter: 'choice', sort: 'text' },
              ]}
              rows={measureRows}
              countNoun="questionnaires"
              emptyMessage={measuresQuery.isPending ? 'Loading questionnaires…' : 'No questionnaires yet.'}
              onRowClick={(row) => setMeasureDraft({
                id: row.measure.id,
                name: row.measure.name,
                schema: row.measure.schema,
                has_scores: row.measure.has_scores,
              })}
            />
          </>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard blockId="settings_forms" title="Forms you send">
        <p className="text-muted" style={{ marginTop: 0 }}>
          A form is how a questionnaire gets filled in. Send it to a client you already see, or publish a link for someone new.
          Answers stay on that link, so they can start on one device and finish on another.
        </p>
        {formDraft ? (
          <FormEditor
            draft={formDraft}
            measures={measures}
            onChange={setFormDraft}
            onClose={() => setFormDraft(null)}
            onSaved={setFormDraft}
          />
        ) : (
          <>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setFormDraft({
                  id: null,
                  name: '',
                  audience: 'private',
                  schema: blankForm(),
                })}
              >
                Add a form
              </button>
            </div>
            <RecordTable
              columns={[
                { key: 'name', label: 'Form', filter: 'text', sort: 'text' },
                { key: 'who', label: 'Who fills it in', filter: 'choice', sort: 'text' },
              ]}
              rows={formRows}
              countNoun="forms"
              emptyMessage={formsQuery.isPending ? 'Loading forms…' : 'No forms yet.'}
              onRowClick={(row) => setFormDraft({
                id: row.form.id,
                name: row.form.name,
                audience: row.form.audience,
                schema: row.form.schema,
              })}
            />
          </>
        )}
        {(measuresQuery.error || formsQuery.error) && (
          <p className="form-error" role="alert">
            {measuresQuery.error?.message || formsQuery.error?.message}
          </p>
        )}
      </SettingsSectionCard>
    </div>
  )
}
