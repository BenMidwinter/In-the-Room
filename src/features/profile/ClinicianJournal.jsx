import { useMemo, useState, useCallback } from 'react'
import { useAppSession } from '../../lib/AppSessionContext'
import RoleBlockShell from '../../components/RoleBlockShell'
import RichTextEditor from '../../components/RichTextEditor'
import { IconMic } from '../../components/EditorToolbarIcons'
import { getJournalEntries, saveJournalEntry } from '../../lib/store'
import { DEMO_TODAY } from '../../lib/dateArchitecture'

const SOMATIC_TAGS = ['Grounded', 'Activated', 'Fatigued', 'Open', 'Constricted', 'Settled']

function defaultJournalTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatJournalTimestamp(date, time) {
  if (!date) return ''
  return time ? `${date} · ${time}` : date
}

function sortJournalEntries(items) {
  return [...items].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return String(b.time || '').localeCompare(String(a.time || ''))
  })
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function AudioReflectionRecorder({ recording, onToggle }) {
  return (
    <div className={`journal-audio${recording ? ' journal-audio--recording' : ''}`}>
      <button type="button" className="primary journal-audio__btn" onClick={onToggle}>
        <span className="journal-audio__mic" aria-hidden>
          {recording && <span className="journal-audio__pulse" />}
          <IconMic />
        </span>
        {recording ? 'Recording… tap to stop' : 'Record Audio Reflection'}
      </button>
      {recording && (
        <div className="journal-audio__wave" aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="journal-audio__bar" style={{ '--bar-h': `${22 + ((i * 13) % 68)}%` }} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClinicianJournal() {
  const { session } = useAppSession()
  const userId = session?.user?.id ?? ''

  const initialEntries = useMemo(
    () => (userId ? getJournalEntries(userId) : []),
    [userId],
  )
  const initialEntry = initialEntries[0] ?? null

  const [entries, setEntries] = useState(initialEntries)
  const [selectedId, setSelectedId] = useState(initialEntry?.id ?? 'new')
  const [feedOpen, setFeedOpen] = useState(false)
  const [recording, setRecording] = useState(false)

  const [draftDate, setDraftDate] = useState(initialEntry?.date ?? DEMO_TODAY)
  const [draftTime, setDraftTime] = useState(initialEntry?.time ?? defaultJournalTime())
  const [draftSomatic, setDraftSomatic] = useState(initialEntry?.somatic_state ?? 'Grounded')
  const [draftBody, setDraftBody] = useState(initialEntry?.body_text ?? '<p></p>')

  const sortedEntries = useMemo(() => sortJournalEntries(entries), [entries])

  const selectedEntry = useMemo(
    () => sortedEntries.find(e => e.id === selectedId) ?? null,
    [sortedEntries, selectedId],
  )

  const loadEntry = useCallback((entry) => {
    if (!entry) {
      setSelectedId('new')
      setDraftDate(DEMO_TODAY)
      setDraftTime(defaultJournalTime())
      setDraftSomatic('Grounded')
      setDraftBody('<p></p>')
      return
    }
    setSelectedId(entry.id)
    setDraftDate(entry.date)
    setDraftTime(entry.time || '09:00')
    setDraftSomatic(entry.somatic_state)
    setDraftBody(entry.body_text || '<p></p>')
    setFeedOpen(false)
  }, [])

  if (!session?.user) {
    return <p className="text-muted">Journal session unavailable. Return to Home and try again.</p>
  }

  const handleNewEntry = () => {
    loadEntry(null)
  }

  const handleSave = () => {
    const saved = saveJournalEntry(userId, {
      id: selectedId === 'new' ? undefined : selectedId,
      date: draftDate,
      time: draftTime,
      somatic_state: draftSomatic,
      body_text: draftBody,
    })
    const next = getJournalEntries(userId)
    setEntries(next)
    setSelectedId(saved.id)
  }

  return (
    <div className="role-block-stack profile-hub">
      <RoleBlockShell blockId="profile_journal">
        <div className="journal journal--in-block">
      <div className="journal__mobile-bar">
        <button
          type="button"
          className="secondary journal__feed-toggle"
          onClick={() => setFeedOpen(o => !o)}
          aria-expanded={feedOpen}
        >
          {feedOpen ? 'Hide past entries' : 'Past entries'}
        </button>
        <button type="button" className="primary" onClick={handleNewEntry}>
          New entry
        </button>
      </div>

      <aside className={`journal__feed${feedOpen ? ' journal__feed--open' : ''}`}>
        <div className="journal__feed-head">
          <h2 className="journal__feed-title">Journal feed</h2>
          <button type="button" className="secondary journal__feed-new" onClick={handleNewEntry}>
            New entry
          </button>
        </div>
        <ul className="journal__feed-list">
          {sortedEntries.map(entry => (
            <li key={entry.id}>
              <button
                type="button"
                className={`journal__feed-item${selectedId === entry.id ? ' journal__feed-item--active' : ''}`}
                onClick={() => loadEntry(entry)}
              >
                <span className="journal__feed-date">{formatJournalTimestamp(entry.date, entry.time)}</span>
                <span className="journal__feed-tag" data-somatic={entry.somatic_state.toLowerCase()}>
                  {entry.somatic_state}
                </span>
                <span className="journal__feed-preview">
                  {stripHtml(entry.body_text).slice(0, 90) || 'Empty entry'}
                </span>
              </button>
            </li>
          ))}
          {sortedEntries.length === 0 && (
            <li className="journal__feed-empty">No journal entries yet.</li>
          )}
        </ul>
      </aside>

      <div className="journal__workspace">
        <header className="journal__workspace-head">
          <div className="journal__meta">
            <div className="form-group journal__meta-field">
              <label htmlFor="journal-date">Date</label>
              <input
                id="journal-date"
                type="date"
                className="paper-input"
                value={draftDate}
                onChange={e => setDraftDate(e.target.value)}
              />
            </div>
            <div className="form-group journal__meta-field">
              <label htmlFor="journal-time">Time</label>
              <input
                id="journal-time"
                type="time"
                className="paper-input"
                value={draftTime}
                onChange={e => setDraftTime(e.target.value)}
              />
            </div>
            <div className="form-group journal__meta-field">
              <label htmlFor="journal-somatic">Somatic state</label>
              <select
                id="journal-somatic"
                className="paper-input journal__somatic-select"
                data-somatic={draftSomatic.toLowerCase()}
                value={draftSomatic}
                onChange={e => setDraftSomatic(e.target.value)}
              >
                {SOMATIC_TAGS.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="primary" onClick={handleSave}>
            Save entry
          </button>
        </header>

        <AudioReflectionRecorder
          recording={recording}
          onToggle={() => setRecording(r => !r)}
        />

        <div className="journal__editor">
          <RichTextEditor
            key={selectedId}
            content={draftBody}
            onChange={setDraftBody}
            mode="basic"
            variant="default"
          />
        </div>

        {selectedEntry && selectedId !== 'new' && (
          <p className="journal__saved-note text-small text-muted">
            Editing entry from {formatJournalTimestamp(selectedEntry.date, selectedEntry.time)} · {selectedEntry.somatic_state}
          </p>
        )}
      </div>
        </div>
      </RoleBlockShell>
    </div>
  )
}
