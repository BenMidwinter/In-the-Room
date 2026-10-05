import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import LetterheadPreview from '../client/LetterheadPreview'
import { bindLabel, missingAnswers } from '../../lib/formModel'
import { openFormLink, saveFormLink, submitFormLink } from '../../lib/supabase/formsRepo'
import { formFillUrl } from './downloadCsv'
import ScoreFields from './ScoreFields'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function FormShell({ title, letterhead, children }) {
  return (
    <main className="form-fill">
      <div className="form-fill__sheet">
        {letterhead ? <LetterheadPreview letterhead={letterhead} /> : null}
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  )
}

function readOnlyAnswer(value) {
  if (value == null || value === '') return '—'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return String(value)
}

function AnswerField({ block, value, onChange, readOnly }) {
  if (readOnly) {
    return <p className="form-question__answer">{readOnlyAnswer(value)}</p>
  }
  if (block.type === 'long_text') {
    return (
      <textarea
        className="paper-input"
        rows={5}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  if (block.type === 'yes_no') {
    return (
      <div className="form-scale" role="group">
        {['yes', 'no'].map((choice) => (
          <button
            key={choice}
            type="button"
            className={`form-scale__btn form-scale__btn--word${value === choice ? ' form-scale__btn--on' : ''}`}
            aria-pressed={value === choice}
            onClick={() => onChange(choice)}
          >
            {choice === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    )
  }
  if (block.type === 'date' || (block.type === 'client' && block.bind === 'dob')) {
    return (
      <input
        className="paper-input"
        type="date"
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  if (block.type === 'choice') {
    return (
      <div className="form-choice">
        {block.options.map((option) => (
          <label key={option} className="form-choice__option">
            <input
              type="radio"
              name={block.id}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    )
  }
  return (
    <input
      className="paper-input"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export default function FormFillPage() {
  const { token = '' } = useParams()
  const valid = UUID.test(token)
  const query = useQuery({
    queryKey: ['form-link', token],
    queryFn: () => openFormLink(token),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
  })
  const [answers, setAnswers] = useState(null)
  const [saveState, setSaveState] = useState('Saved')
  const [sending, setSending] = useState(false)
  const dirty = useRef(false)
  const timer = useRef(null)
  const answersRef = useRef({})
  const pack = query.data
  const shown = answers ?? pack?.answers ?? {}
  const editable = pack?.status === 'in_progress'

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!valid || !editable) return undefined
    const flush = () => {
      if (!dirty.current) return
      window.clearTimeout(timer.current)
      saveFormLink(token, answersRef.current).catch(() => {})
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [token, valid, editable])

  const changeAnswers = (next) => {
    dirty.current = true
    answersRef.current = next
    setAnswers(next)
    setSaveState('Saving…')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await saveFormLink(token, next)
        setSaveState('Saved')
      } catch (err) {
        setSaveState(err.message || 'Could not save')
      }
    }, 600)
  }

  const setBlock = (id, value) => changeAnswers({ ...shown, [id]: value })

  const send = async () => {
    if (!pack) return
    const problem = missingAnswers(pack.schema, shown, pack.measures)
    if (problem) {
      setSaveState(problem)
      return
    }
    setSending(true)
    try {
      window.clearTimeout(timer.current)
      await saveFormLink(token, shown)
      await submitFormLink(token)
      dirty.current = false
      setSaveState('Sent')
      await query.refetch()
    } catch (err) {
      setSaveState(err.message || 'Could not send')
    } finally {
      setSending(false)
    }
  }

  if (!valid) {
    return <FormShell title="Form"><p>This link does not open a form.</p></FormShell>
  }
  if (query.isPending) {
    return <FormShell title="Form"><p>Opening this form…</p></FormShell>
  }
  if (query.error || !pack) {
    return <FormShell title="Form"><p>{query.error?.message || 'This link does not open a form.'}</p></FormShell>
  }

  const sent = pack.status !== 'in_progress'

  return (
    <FormShell title={pack.title} letterhead={pack.letterhead}>
      {sent && <p className="form-fill__note">Thank you. This has been sent.</p>}
      {pack.schema.blocks.map((block) => {
        if (block.type === 'prose') {
          return <p key={block.id} className="form-fill__prose">{block.text}</p>
        }
        if (block.type === 'measure') {
          const schema = pack.measures[block.measureId]
          return (
            <section key={block.id} className="form-question">
              <h2>{block.label || 'Questionnaire'}</h2>
              {schema ? (
                <ScoreFields
                  schema={schema}
                  value={shown[block.id]}
                  readOnly={!editable}
                  onChange={(value) => setBlock(block.id, value)}
                />
              ) : (
                <p>This questionnaire is missing.</p>
              )}
            </section>
          )
        }
        const label = block.type === 'client' ? (block.label || bindLabel(block.bind)) : block.label
        return (
          <div key={block.id} className="form-question">
            <p className="form-question__label">
              {label}
              {block.required ? <span aria-hidden> *</span> : null}
            </p>
            <AnswerField
              block={block}
              value={shown[block.id]}
              readOnly={!editable}
              onChange={(value) => setBlock(block.id, value)}
            />
          </div>
        )
      })}
      {editable && (
        <footer className="form-fill__foot">
          <p className="form-fill__save">
            <span>{saveState === 'Saved' ? 'Saved on this link. You can close it and finish later.' : saveState}</span>
            <button
              type="button"
              className="form-fill__link"
              onClick={() => navigator.clipboard.writeText(formFillUrl(token)).catch(() => {})}
            >
              Copy link
            </button>
          </p>
          <button type="button" className="primary form-fill__send" onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </footer>
      )}
    </FormShell>
  )
}
