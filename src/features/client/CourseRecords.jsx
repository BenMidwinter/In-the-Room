import { useState } from 'react'
import RecordTable from '../../components/RecordTable'
import { useChoose, useConfirm, useToast } from '../../components/ui'
import { measureScoresCsv, submissionStatusLabel } from '../../lib/formModel'
import {
  useDeleteSubmissionMutation,
  useEpisodeFormsQuery,
  useEpisodeOutcomesQuery,
  useFormsQuery,
  useMeasuresQuery,
  useRecordScoreMutation,
  useSendFormMutation,
} from '../../lib/formQueries'
import { listMeasureScores } from '../../lib/supabase/formsRepo'
import { downloadCsv, formFillUrl } from '../forms/downloadCsv'
import RowMenu from '../forms/RowMenu'
import ScoreFields from '../forms/ScoreFields'

function formatDate(iso) {
  if (!iso) return '—'
  const date = String(iso).slice(0, 10)
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function CourseAccordion({ title, open, onToggle, actions, children }) {
  return (
    <section className={`course-accordion${open ? ' course-accordion--open' : ''}`}>
      <div className="course-accordion__bar">
        <button
          type="button"
          className="course-accordion__toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="course-accordion__mark" aria-hidden>{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {open ? actions : null}
      </div>
      {open ? <div className="course-accordion__body">{children}</div> : null}
    </section>
  )
}

function statusLabel(form) {
  return submissionStatusLabel(form.status, form.started)
}

async function copyText(text) {
  await navigator.clipboard.writeText(text)
}

export function EpisodeForms({ episode, clientId, userId, organizationId, open, onToggle }) {
  const toast = useToast()
  const confirm = useConfirm()
  const formsQuery = useFormsQuery(userId || '')
  const sentQuery = useEpisodeFormsQuery(episode.id, open)
  const send = useSendFormMutation(episode.id)
  const removeSubmission = useDeleteSubmissionMutation(episode.id)
  const [picking, setPicking] = useState(false)
  const published = (formsQuery.data || []).filter((form) => form.audience === 'private' && form.status === 'published')

  const copyLink = async (token) => {
    try {
      await copyText(formFillUrl(token))
      toast.saved('Link copied. Send it to the client.')
    } catch (err) {
      toast.error(err.message || 'Could not copy the link')
    }
  }

  const addForm = async (formId) => {
    try {
      const created = await send.mutateAsync({
        formId,
        clientId,
        episodeId: episode.id,
        organizationId: organizationId || null,
      })
      setPicking(false)
      await copyLink(created.token)
    } catch (err) {
      toast.error(err.message || 'Could not add the form')
    }
  }

  const removeForm = async (form) => {
    const completed = statusLabel(form) === 'Completed'
    const ok = await confirm({
      title: 'Delete this form?',
      message: completed
        ? 'This removes it from the course. A score already saved stays under Outcome measures.'
        : 'This link will stop working.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeSubmission.mutateAsync(form.id)
      toast.saved('Form removed from this course')
    } catch (err) {
      toast.error(err.message || 'Could not delete the form')
    }
  }

  const rows = (sentQuery.data || []).map((form) => {
    const label = statusLabel(form)
    return {
      id: form.id,
      form,
      filterValues: { name: form.name, status: label },
      sortValues: { name: form.name, date: form.submitted_at || form.updated_at },
      cells: {
        name: <span className="record-table__primary">{form.name}</span>,
        status: (
          <span className={`badge ${label === 'Completed' ? 'badge-green' : 'badge-grey'}`}>{label}</span>
        ),
        date: formatDate(form.submitted_at || form.updated_at),
        menu: (
          <RowMenu
            label={`Actions for ${form.name}`}
            items={[
              {
                label: 'View',
                onSelect: () => window.open(formFillUrl(form.token), '_blank', 'noopener'),
              },
              { label: 'Copy link', onSelect: () => copyLink(form.token) },
              { label: 'Delete', danger: true, onSelect: () => removeForm(form) },
            ]}
          />
        ),
      },
    }
  })

  return (
    <CourseAccordion
      title="Forms"
      open={open}
      onToggle={onToggle}
      actions={(
        <button type="button" className="secondary" onClick={() => setPicking(true)} disabled={send.isPending}>
          Add
        </button>
      )}
    >
      {picking && (
        <div className="form-picker">
          <p className="form-picker__label">Choose a form to add to this course.</p>
          {formsQuery.isPending ? (
            <p className="form-picker__empty">Loading forms…</p>
          ) : published.length ? (
            <div className="form-picker__list">
              {published.map((form) => (
                <button
                  key={form.id}
                  type="button"
                  className="secondary"
                  disabled={send.isPending}
                  onClick={() => addForm(form.id)}
                >
                  {form.name}
                </button>
              ))}
              <button type="button" className="secondary" onClick={() => setPicking(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <p className="form-picker__empty">
                Publish a form for a client you already see, in Settings, under Forms. An intake form is shared from Settings, and is not added on a course.
              </p>
              <button type="button" className="secondary" onClick={() => setPicking(false)}>Cancel</button>
            </>
          )}
        </div>
      )}
      <RecordTable
        columns={[
          { key: 'name', label: 'Name', filter: 'text', sort: 'text' },
          { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
          { key: 'date', label: 'Date', sort: 'date' },
          { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
        ]}
        rows={rows}
        countNoun="forms"
        defaultSort={{ key: 'date', direction: 'desc' }}
        emptyMessage={sentQuery.isPending ? 'Loading forms…' : 'No forms on this course yet.'}
      />
    </CourseAccordion>
  )
}

export function EpisodeOutcomes({ episode, clientId, userId, organizationId, open, onToggle }) {
  const toast = useToast()
  const choose = useChoose()
  const measuresQuery = useMeasuresQuery(userId || '')
  const outcomesQuery = useEpisodeOutcomesQuery(episode.id, open)
  const record = useRecordScoreMutation(episode.id)
  const [draft, setDraft] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const outcomes = outcomesQuery.data || []
  const selected = outcomes.find((row) => row.id === selectedId) || null

  const addScore = async () => {
    const measures = (measuresQuery.data || []).filter((measure) => measure.is_active)
    if (!measures.length) {
      toast.error('Add a questionnaire in Settings, under Forms.')
      return
    }
    let measureId = measures[0].id
    if (measures.length > 1) {
      measureId = await choose({
        title: 'Add a score',
        label: 'Questionnaire',
        confirmLabel: 'Continue',
        options: measures.map((measure) => ({ value: measure.id, label: measure.name })),
        defaultValue: measures[0].id,
      })
      if (!measureId) return
    }
    const measure = measures.find((row) => row.id === measureId)
    if (!measure) return
    setDraft({
      measure,
      recordedOn: new Date().toISOString().slice(0, 10),
      answer: measure.schema.kind === 'overall' ? {} : {},
    })
    setSelectedId(null)
  }

  const saveScore = async () => {
    if (!draft) return
    try {
      await record.mutateAsync({
        measureId: draft.measure.id,
        clientId,
        episodeId: episode.id,
        organizationId: organizationId || null,
        recordedOn: draft.recordedOn,
        answer: draft.answer,
      })
      setDraft(null)
      toast.saved('Score saved')
    } catch (err) {
      toast.error(err.message || 'Could not save the score')
    }
  }

  const download = async () => {
    const byId = new Map()
    for (const row of outcomes) byId.set(row.measure_id, row.measure_name)
    const options = [...byId.entries()].map(([value, label]) => ({ value, label }))
    if (!options.length) {
      toast.error('No scores on this course yet.')
      return
    }
    let measureId = options[0].value
    if (options.length > 1) {
      measureId = await choose({
        title: 'Download scores',
        label: 'Questionnaire',
        confirmLabel: 'Download',
        options,
        defaultValue: options[0].value,
      })
      if (!measureId) return
    }
    try {
      const pack = await listMeasureScores(measureId, clientId)
      if (!pack.rows.length) {
        toast.error('No scores yet.')
        return
      }
      downloadCsv(`${pack.slug || 'scores'}.csv`, measureScoresCsv(pack.schema, pack.rows))
    } catch (err) {
      toast.error(err.message || 'Could not download scores')
    }
  }

  const rows = outcomes.map((row) => ({
    id: row.id,
    filterValues: { name: row.measure_name, score: String(row.total) },
    sortValues: { name: row.measure_name, date: row.recorded_on, score: row.total },
    cells: {
      date: formatDate(row.recorded_on),
      name: <span className="record-table__primary">{row.measure_name}</span>,
      score: row.total,
    },
  }))

  return (
    <CourseAccordion
      title="Outcome measures"
      open={open}
      onToggle={onToggle}
      actions={(
        <button type="button" className="secondary" onClick={addScore}>Add</button>
      )}
    >
      <RecordTable
        columns={[
          { key: 'date', label: 'Date', sort: 'date' },
          { key: 'name', label: 'Questionnaire', filter: 'text', sort: 'text' },
          { key: 'score', label: 'Score', sort: 'number' },
        ]}
        rows={rows}
        selectedId={selectedId}
        countNoun="scores"
        defaultSort={{ key: 'date', direction: 'desc' }}
        emptyMessage={outcomesQuery.isPending ? 'Loading scores…' : 'No scores on this course yet.'}
        onRowClick={(row) => setSelectedId(row.id)}
      />
      <div className="form-table-footer">
        <button type="button" className="secondary" onClick={download}>Download</button>
        <p className="form-export-note">
          Download a spreadsheet of this client’s scores: the date, date of birth, gender, the total, and each statement.
          Check it against the published tables for that questionnaire, including typical clinical and non-clinical scores.
        </p>
      </div>
      {selected && (
        <div className="score-detail">
          <p className="form-question__label">{selected.measure_name} · {selected.total}</p>
          {selected.schema.kind === 'items' && selected.schema.items.map((item) => (
            <p key={item.id} className="score-detail__line">
              <span>{item.label}</span>
              <strong>{selected.items[item.id] ?? '—'}</strong>
            </p>
          ))}
        </div>
      )}
      {draft && (
        <div className="score-panel">
          <p className="form-question__label">{draft.measure.name}</p>
          <div className="form-group">
            <label htmlFor="score-date">Date</label>
            <input
              id="score-date"
              type="date"
              className="paper-input"
              value={draft.recordedOn}
              onChange={(event) => setDraft({ ...draft, recordedOn: event.target.value })}
            />
          </div>
          <ScoreFields
            schema={draft.measure.schema}
            value={draft.answer}
            onChange={(answer) => setDraft({ ...draft, answer })}
          />
          <div className="form-actions">
            <button type="button" className="primary" onClick={saveScore} disabled={record.isPending}>
              {record.isPending ? 'Saving…' : 'Save score'}
            </button>
            <button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </CourseAccordion>
  )
}
