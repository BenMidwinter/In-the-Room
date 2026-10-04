import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import FormOverlay from './FormOverlay'
import PageHeader from './PageHeader'
import RecordTable from './RecordTable'
import RowMenu from '../features/forms/RowMenu'
import { useConfirm, useToast } from './ui'
import { useAppSession } from '../lib/AppSessionContext'
import { formatDisplayDate } from '../lib/dateArchitecture'
import { listServices } from '../lib/supabase/servicesRepo'
import {
  listScreenerBoard,
  listTags,
  rejectScreenerClient,
  saveWaitlistPlacement,
} from '../lib/supabase/screenerRepo'

function formPath(person) {
  return person.submissionId ? `/clients/${person.id}/forms/${person.submissionId}` : null
}

function PlacementEditor({ person, mode, services, tags, onClose, onSaved }) {
  const toast = useToast()
  const [preferredTimes, setPreferredTimes] = useState(person.preferredTimes || '')
  const [information, setInformation] = useState(person.information || '')
  const [serviceId, setServiceId] = useState(person.serviceId || '')
  const [tagIds, setTagIds] = useState(person.tagIds || [])
  const [saving, setSaving] = useState(false)

  const toggleTag = (id) => {
    setTagIds((current) => (
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]
    ))
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveWaitlistPlacement({
        clientId: person.id,
        preferredTimes,
        information,
        serviceId: serviceId || null,
        tagIds,
        accept: mode === 'accept',
      })
      toast.saved(mode === 'accept' ? `${person.name} is on the waitlist.` : 'Waitlist details saved')
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Could not save these details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormOverlay
      title={mode === 'accept' ? 'Add to the waitlist' : 'Waitlist details'}
      eyebrow={person.name}
      onClose={onClose}
      footer={(
        <div className="form-actions">
          <button type="button" className="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : mode === 'accept' ? 'Add to waitlist' : 'Save'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      )}
    >
      <div className="form-group">
        <label htmlFor="waitlist-times">Preferred times</label>
        <input
          id="waitlist-times"
          className="paper-input"
          value={preferredTimes}
          placeholder="Tuesdays after school, or Thursday mornings"
          onChange={(event) => setPreferredTimes(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="waitlist-session">Session</label>
        <select
          id="waitlist-session"
          className="paper-input"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">Choose a session</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="waitlist-info">Information</label>
        <textarea
          id="waitlist-info"
          className="paper-input"
          rows={4}
          value={information}
          placeholder="Anything the screener needs the waitlist to remember"
          onChange={(event) => setInformation(event.target.value)}
        />
      </div>
      <fieldset className="form-group">
        <legend>Waitlist tags</legend>
        {tags.length ? tags.map((tag) => (
          <label key={tag.id} className="screener-tag">
            <input
              type="checkbox"
              checked={tagIds.includes(tag.id)}
              onChange={() => toggleTag(tag.id)}
            />
            <span>{tag.name}</span>
          </label>
        )) : (
          <p className="text-muted">Add waitlist tags in Settings, under Tags.</p>
        )}
      </fieldset>
    </FormOverlay>
  )
}

export default function ScreenerPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { refreshClients } = useAppSession()
  const [view, setView] = useState('screener')
  const [editor, setEditor] = useState(null)
  const board = useQuery({
    queryKey: ['screener-board'],
    queryFn: listScreenerBoard,
    staleTime: 0,
  })
  const services = useQuery({
    queryKey: ['services'],
    queryFn: listServices,
    staleTime: 0,
  })
  const tags = useQuery({
    queryKey: ['tags', 'waitlist'],
    queryFn: () => listTags('waitlist'),
    staleTime: 0,
  })
  const people = (board.data || []).filter((person) => person.status === view)
  const tagName = new Map((tags.data || []).map((tag) => [tag.id, tag.name]))
  const serviceName = new Map((services.data || []).map((service) => [service.id, service.name]))

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['screener-board'] })
    refreshClients()
  }

  const reject = async (person) => {
    const ok = await confirm({
      title: 'Reject this referral?',
      message: `${person.name} leaves the screener. Their form stays on the profile.`,
      confirmLabel: 'Reject',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await rejectScreenerClient(person.id)
      toast.saved('Referral rejected')
      refresh()
    } catch (err) {
      toast.error(err.message || 'Could not reject this referral')
    }
  }

  const rows = people.map((person) => {
    const href = formPath(person)
    const menu = [
      href ? { label: 'View form', onSelect: () => navigate(href) } : null,
      { label: 'Edit details', onSelect: () => setEditor({ person, mode: 'edit' }) },
    ].filter(Boolean)
    return {
      id: person.id,
      filterValues: {
        name: person.name,
        form: person.formName,
        tags: person.tagIds.map((id) => tagName.get(id)).filter(Boolean).join(' '),
      },
      sortValues: {
        name: person.name,
        added: person.createdAt,
      },
      cells: {
        name: <Link className="record-table__primary" to={`/clients/${person.id}`}>{person.name}</Link>,
        form: href
          ? <Link to={href}>{person.formName || 'Form'}</Link>
          : '—',
        added: formatDisplayDate(String(person.createdAt || '').slice(0, 10)) || '—',
        note: href
          ? <Link className="screener-note" to={href}>{person.information || 'Open the completed form'}</Link>
          : <span className="screener-note screener-note--quiet">{person.information || 'No form yet'}</span>,
        times: person.preferredTimes || '—',
        session: serviceName.get(person.serviceId) || '—',
        tags: person.tagIds.map((id) => tagName.get(id)).filter(Boolean).join(', ') || '—',
        accept: (
          <button type="button" className="secondary" onClick={() => setEditor({ person, mode: 'accept' })}>
            Accept
          </button>
        ),
        reject: (
          <button type="button" className="secondary" onClick={() => reject(person)}>Reject</button>
        ),
        menu: <RowMenu label={`Actions for ${person.name}`} items={menu} />,
      },
    }
  })

  const screenerColumns = [
    { key: 'name', label: 'Name', filter: 'text' },
    { key: 'form', label: 'Form', filter: 'text' },
    { key: 'added', label: 'Added', sort: 'date' },
    { key: 'accept', label: '', sort: false, className: 'record-table__col--actions' },
    { key: 'reject', label: '', sort: false, className: 'record-table__col--actions' },
    { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
  ]
  const waitlistColumns = [
    { key: 'name', label: 'Name', filter: 'text' },
    { key: 'note', label: 'Form', filter: 'text' },
    { key: 'times', label: 'Preferred times', filter: 'text' },
    { key: 'session', label: 'Session', filter: 'text' },
    { key: 'tags', label: 'Tags', filter: 'text' },
    { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Screener"
        subtitle={view === 'screener'
          ? 'People who sent a form that places them here, waiting to be screened.'
          : 'People you have accepted, waiting for a session.'}
        toolbar={(
          <div className="screener-switch" role="tablist" aria-label="Screener lists">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'screener'}
              className={`screener-switch__btn${view === 'screener' ? ' screener-switch__btn--on' : ''}`}
              onClick={() => setView('screener')}
            >
              Screener
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'waitlist'}
              className={`screener-switch__btn${view === 'waitlist' ? ' screener-switch__btn--on' : ''}`}
              onClick={() => setView('waitlist')}
            >
              Waitlist
            </button>
          </div>
        )}
      />
      <RecordTable
        columns={view === 'screener' ? screenerColumns : waitlistColumns}
        rows={rows}
        countNoun="people"
        defaultSort={view === 'screener' ? { key: 'added', direction: 'asc' } : { key: 'name', direction: 'asc' }}
        emptyMessage={board.isPending
          ? 'Loading…'
          : view === 'screener'
            ? 'Nobody is waiting to be screened. Publish a form and choose “Place the person on the screener”.'
            : 'Nobody is on the waitlist yet. Accept someone from the screener.'}
      />
      {board.error && <p className="form-error" role="alert">{board.error.message}</p>}
      {editor && (
        <PlacementEditor
          key={`${editor.person.id}-${editor.mode}`}
          person={editor.person}
          mode={editor.mode}
          services={services.data || []}
          tags={tags.data || []}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            if (editor.mode === 'accept') setView('waitlist')
            refresh()
          }}
        />
      )}
    </div>
  )
}
