import { useMemo, useState, useCallback } from 'react'
import { useAppSession } from '../../lib/AppSessionContext'
import SectionCard from '../../components/SectionCard'
import RichTextEditor from '../../components/RichTextEditor'
import { useToast } from '../../components/ui'
import { useJournalEntriesQuery, useSaveJournalEntryMutation } from '../../lib/journalQueries'
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

function draftFromEntry(entry) {
  if (!entry) {
    return {
      date: DEMO_TODAY,
      time: defaultJournalTime(),
      somatic: 'Grounded',
      body: '<p></p>',
    }
  }
  return {
    date: entry.date,
    time: entry.time || '09:00',
    somatic: entry.somatic_state || 'Grounded',
    body: entry.body_text || '<p></p>',
  }
}

export default function ClinicianJournal() {
  const { session } = useAppSession()
  const userId = session?.user?.id ?? ''
  const toast = useToast()
  const { data: entries = [], isPending, error } = useJournalEntriesQuery(userId)
  const saveEntry = useSaveJournalEntryMutation(userId)

  const sortedEntries = useMemo(() => sortJournalEntries(entries), [entries])
  const [selectedId, setSelectedId] = useState('new')
  const [booted, setBooted] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [draftDate, setDraftDate] = useState(DEMO_TODAY)
  const [draftTime, setDraftTime] = useState(defaultJournalTime)
  const [draftSomatic, setDraftSomatic] = useState('Grounded')
  const [draftBody, setDraftBody] = useState('<p></p>')

  if (!booted && userId && !isPending) {
    const first = sortedEntries[0] ?? null
    const draft = draftFromEntry(first)
    setBooted(true)
    if (first) setSelectedId(first.id)
    setDraftDate(draft.date)
    setDraftTime(draft.time)
    setDraftSomatic(draft.somatic)
    setDraftBody(draft.body)
  }

  const selectedEntry = useMemo(
    () => sortedEntries.find(e => e.id === selectedId) ?? null,
    [sortedEntries, selectedId],
  )

  const loadEntry = useCallback((entry) => {
    const draft = draftFromEntry(entry)
    setSelectedId(entry?.id ?? 'new')
    setDraftDate(draft.date)
    setDraftTime(draft.time)
    setDraftSomatic(draft.somatic)
    setDraftBody(draft.body)
    setFeedOpen(false)
  }, [])

  if (!session?.user) {
    return <p className="text-muted">Journal session unavailable. Return to Home and try again.</p>
  }

  const handleNewEntry = () => {
    loadEntry(null)
  }

  const handleSave = async () => {
    try {
      const saved = await saveEntry.mutateAsync({
        id: selectedId === 'new' ? undefined : selectedId,
        date: draftDate,
        time: draftTime,
        somatic_state: draftSomatic,
        body_text: draftBody,
      })
      setSelectedId(saved.id)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not save the journal entry.')
    }
  }

  return (
    <div className="section-card-stack profile-hub">
      <SectionCard blockId="profile_journal">
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
          {!booted && (
            <li className="journal__feed-empty">Loading journal…</li>
          )}
          {booted && sortedEntries.map(entry => (
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
          {booted && error && (
            <li className="journal__feed-empty">{error.message || 'Could not load journal entries.'}</li>
          )}
          {booted && !error && sortedEntries.length === 0 && (
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
          <button type="button" className="primary" onClick={handleSave} disabled={!booted || saveEntry.isPending}>
            {saveEntry.isPending ? 'Saving…' : 'Save entry'}
          </button>
        </header>

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
      </SectionCard>
    </div>
  )
}
