import { useState } from 'react'
import { useBrowserPref } from '../lib/browserStore'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import FormOverlay from './FormOverlay'
import TagLabel from './TagLabel'
import PageHeader from './PageHeader'
import SectionNav from './SectionNav'
import RecordTable from './RecordTable'
import RowMenu from '../features/forms/RowMenu'
import { useConfirm, useToast } from './ui'
import { useAppSession } from '../lib/AppSessionContext'
import { formatDisplayDate } from '../lib/dateArchitecture'
import { listServices } from '../lib/supabase/servicesRepo'
import {
  addClientToWaitlist,
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
        serviceId: services.some((service) => service.id === serviceId) ? serviceId : null,
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
        <label htmlFor="waitlist-session">Appointment type</label>
        <select
          id="waitlist-session"
          className="paper-input"
          value={services.some((service) => service.id === serviceId) ? serviceId : ''}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">Choose an appointment type</option>
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
            <TagLabel name={tag.name} color={tag.color} />
          </label>
        )) : (
          <p className="text-muted">Add waitlist tags in Settings, under Tags.</p>
        )}
      </fieldset>
    </FormOverlay>
  )
}

function WaitlistAddForm({ services, tags, userId, onClose, onSaved }) {
  const toast = useToast()
  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [preferredTimes, setPreferredTimes] = useState('')
  const [information, setInformation] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [tagIds, setTagIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const toggleTag = (id) => {
    setTagIds((current) => (
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]
    ))
  }

  const save = async (event) => {
    event.preventDefault()
    if (!firstName.trim() || !surname.trim() || !dob) {
      setError('Enter a first name, a surname, and a date of birth.')
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter an email address.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addClientToWaitlist({
        userId,
        firstName,
        surname,
        dob,
        email,
        preferredTimes,
        information,
        serviceId: services.some((service) => service.id === serviceId) ? serviceId : null,
        tagIds,
      })
      toast.saved(`${firstName.trim()} ${surname.trim()} is on the waitlist.`)
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Could not add this client')
      setError(err.message || 'Could not add this client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormOverlay
      title="Add client"
      eyebrow="Waitlist"
      onClose={onClose}
      footer={(
        <div className="form-actions">
          <button type="submit" form="waitlist-add-client" className="primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add client'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      )}
    >
      <form id="waitlist-add-client" onSubmit={save}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="waitlist-add-first">First name</label>
            <input
              id="waitlist-add-first"
              className="paper-input"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="waitlist-add-surname">Surname</label>
            <input
              id="waitlist-add-surname"
              className="paper-input"
              value={surname}
              onChange={(event) => setSurname(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="waitlist-add-dob">Date of birth</label>
          <input
            id="waitlist-add-dob"
            type="date"
            className="paper-input"
            value={dob}
            onChange={(event) => setDob(event.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="waitlist-add-email">Email</label>
          <input
            id="waitlist-add-email"
            type="email"
            className="paper-input"
            value={email}
            placeholder="Where invoices go, unless a contact is flagged"
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="waitlist-add-times">Preferred times</label>
          <input
            id="waitlist-add-times"
            className="paper-input"
            value={preferredTimes}
            placeholder="Tuesdays after school, or Thursday mornings"
            onChange={(event) => setPreferredTimes(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="waitlist-add-session">Appointment type</label>
          <select
            id="waitlist-add-session"
            className="paper-input"
            value={services.some((service) => service.id === serviceId) ? serviceId : ''}
            onChange={(event) => setServiceId(event.target.value)}
          >
            <option value="">Choose an appointment type</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="waitlist-add-info">Information</label>
          <textarea
            id="waitlist-add-info"
            className="paper-input"
            rows={4}
            value={information}
            placeholder="Anything the waitlist needs to remember"
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
              <TagLabel name={tag.name} color={tag.color} />
            </label>
          )) : (
            <p className="text-muted">Add waitlist tags in Settings, under Tags.</p>
          )}
        </fieldset>
      </form>
    </FormOverlay>
  )
}

function TagChips({ ids, tagById }) {
  const chips = ids.map((id) => tagById.get(id)).filter(Boolean)
  if (!chips.length) return '—'
  return (
    <span className="tag-chips">
      {chips.map((tag) => (
        <TagLabel key={tag.id} name={tag.name} color={tag.color} />
      ))}
    </span>
  )
}

export default function ScreenerPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { refreshClients, session } = useAppSession()
  const [storedView, setView] = useBrowserPref('screener.view', 'screener')
  const view = storedView === 'waitlist' || storedView === 'rejected' ? storedView : 'screener'
  const [editor, setEditor] = useState(null)
  const [adding, setAdding] = useState(false)
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
  const tagById = new Map((tags.data || []).map((tag) => [tag.id, tag]))
  const appointmentTypes = (services.data || []).filter((service) => (
    service.service_type === 'appointment' && service.is_active !== false
  ))
  const serviceName = new Map(appointmentTypes.map((service) => [service.id, service.name]))

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['screener-board'] })
    refreshClients()
  }

  const reject = async (person) => {
    const ok = await confirm({
      title: 'Reject this referral?',
      message: `${person.name} leaves the screener and stays on Rejected. Their form stays on the profile.`,
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
      view === 'rejected' ? null : { label: 'Edit details', onSelect: () => setEditor({ person, mode: 'edit' }) },
    ].filter(Boolean)
    return {
      id: person.id,
      filterValues: {
        name: person.name,
        form: person.formName,
        tags: person.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join(' '),
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
        tags: <TagChips ids={person.tagIds} tagById={tagById} />,
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
  const rejectedColumns = [
    { key: 'name', label: 'Name', filter: 'text' },
    { key: 'form', label: 'Form', filter: 'text' },
    { key: 'added', label: 'Added', sort: 'date' },
    { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
  ]
  const waitlistColumns = [
    { key: 'name', label: 'Name', filter: 'text' },
    { key: 'note', label: 'Form', filter: 'text' },
    { key: 'times', label: 'Preferred times', filter: 'text' },
    { key: 'session', label: 'Appointment type', filter: 'text' },
    { key: 'tags', label: 'Tags', filter: 'text' },
    { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
  ]

  return (
    <div className="page">
      <div className="page-mast">
        <PageHeader
          title="Screener"
          help={view === 'waitlist'
            ? 'People you have accepted, waiting for a session.'
            : view === 'rejected'
              ? 'People who were referred and not taken onto the waitlist.'
              : 'People who sent a form that places them here, waiting to be screened.'}
        />
        <SectionNav
          label="Screener lists"
          items={[
            { key: 'screener', label: 'Screener', active: view === 'screener', onSelect: () => setView('screener') },
            { key: 'waitlist', label: 'Waitlist', active: view === 'waitlist', onSelect: () => setView('waitlist') },
            { key: 'rejected', label: 'Rejected', active: view === 'rejected', onSelect: () => setView('rejected') },
          ]}
        />
      </div>
      <RecordTable
        remember={`screener-${view}`}
        key={view}
        headerAction={view === 'waitlist' ? (
          <button type="button" className="secondary record-table__add" onClick={() => setAdding(true)}>
            Add client
          </button>
        ) : null}
        columns={view === 'waitlist' ? waitlistColumns : view === 'rejected' ? rejectedColumns : screenerColumns}
        rows={rows}
        countNoun="people"
        defaultSort={view === 'waitlist' ? { key: 'name', direction: 'asc' } : { key: 'added', direction: 'asc' }}
        emptyMessage={board.isPending
          ? 'Loading…'
          : view === 'waitlist'
            ? 'Nobody is on the waitlist yet. Add a client, or accept someone from the screener.'
            : view === 'rejected'
              ? 'Nobody has been rejected.'
              : 'Nobody is waiting to be screened. Publish a form and choose “Place the person on the screener”.'}
      />
      {board.error && <p className="form-error" role="alert">{board.error.message}</p>}
      {adding && (
        <WaitlistAddForm
          services={appointmentTypes}
          tags={tags.data || []}
          userId={session.user.id}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            refresh()
          }}
        />
      )}
      {editor && (
        <PlacementEditor
          key={`${editor.person.id}-${editor.mode}`}
          person={editor.person}
          mode={editor.mode}
          services={appointmentTypes}
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
