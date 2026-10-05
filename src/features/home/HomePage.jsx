import { useMemo, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { useAppSession } from '../../lib/AppSessionContext'
import { useAppClients } from '../../lib/queries'
import { useUpcomingAppointmentsQuery, useAllAppointmentsQuery } from '../../lib/appointmentQueries'
import { getProgressNoteByAppointment } from '../../lib/store'
import { getNextProgressNoteTask } from '../../lib/homeBlocks'
import { useProgressNoteIndexQuery } from '../../lib/progressNoteQueries'
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatSessionDateTime,
  appointmentSchedule,
  appointmentInstant,
  isClientSessionAppointment,
} from '../../lib/appointmentUtils'
import { appointmentDisplayName } from '../../lib/calendarServiceStyles'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import PageHeader from '../../components/PageHeader'
import HelpTip from '../../components/HelpTip'
import SectionCard from '../../components/SectionCard'
import RecordTable from '../../components/RecordTable'

const CASELOAD_COLUMNS = [
  { key: 'name', label: 'Name', filter: 'text' },
  { key: 'dob', label: 'Date of birth', sort: 'date' },
  { key: 'next', label: 'Next', sort: 'date', sortFirst: 'asc' },
]

function nextSessionByClient(appointments, today) {
  const next = new Map()
  appointments.forEach((appt) => {
    if (!appt.client_id) return
    if (!isClientSessionAppointment(appt)) return
    if (appt.parent_appointment_id) return
    if (appt.attendance_status === 'cancelled') return
    const date = appointmentSchedule(appt).session_date
    if (!date || date < today) return
    const current = next.get(appt.client_id)
    if (!current || appointmentInstant(appt) < appointmentInstant(current)) {
      next.set(appt.client_id, appt)
    }
  })
  return next
}

function clientLabel(clients, clientId) {
  return clients.find((c) => c.id === clientId)?.real_name || 'Client'
}

function HomeStatCard({ title, children }) {
  return (
    <section className="home-stat-card">
      <h3 className="home-stat-card__title">{title}</h3>
      <div className="home-stat-card__body">{children}</div>
    </section>
  )
}

function UpcomingTimeline({ appointments, clients, onSelect }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollLeft = 0
  }, [appointments])

  if (!appointments.length) {
    return (
      <p className="section-card__empty">
        Nothing scheduled yet.{' '}
        <Link to="/calendar">Open the calendar</Link>
        {' '}to book a session, or{' '}
        <Link to="/clients/add">add a client</Link>.
      </p>
    )
  }

  return (
    <div className="timeline-card timeline-card--horizontal home-upcoming-timeline">
      <div className="timeline-card__header">
        <h3 className="card__title">Upcoming appointments</h3>
        <HelpTip text="Earliest on the left. Scroll for later sessions." label="About upcoming appointments" />
      </div>
      <div ref={scrollRef} className="timeline-card__scroll timeline-card__scroll--horizontal">
        <ul className="timeline timeline--horizontal">
          {appointments.map((appt, i) => {
            const isLast = i === appointments.length - 1
            const service = appointmentDisplayName(appt)
            const later = appointmentSchedule(appt).session_date > todayYmd()
            return (
              <li key={appt.id} className={`timeline__item${later ? ' timeline__item--future' : ''}`}>
                <div className="timeline__rail" aria-hidden>
                  <div className="timeline__marker" />
                  {!isLast && <div className="timeline__line timeline__line--horizontal" />}
                </div>
                <button
                  type="button"
                  className={`timeline__body timeline__body--link home-upcoming-timeline__card${later ? ' home-upcoming-timeline__card--later' : ''}`}
                  onClick={() => onSelect(appt)}
                >
                  <div className="timeline__meta">
                    <time className="home-upcoming-timeline__when">
                      {formatAppointmentDate(appt)}
                    </time>
                    <span className="home-upcoming-timeline__time">
                      {formatAppointmentTime(appt)}
                    </span>
                  </div>
                  <p className="timeline__title">
                    {clientLabel(clients, appt.client_id)}
                  </p>
                  <p className="timeline__summary text-muted">
                    {service}
                    {appt.location ? ` · ${appt.location}` : ''}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { session, activePersona } = useAppSession()
  const overlay = useAppointmentOverlay()
  const navigate = useNavigate()
  const { clients } = useAppClients()
  const name = activePersona?.name && activePersona.name !== 'Clinician'
    ? activePersona.name
    : null

  const { data: upcoming = [], isLoading: upcomingLoading } = useUpcomingAppointmentsQuery({
    userId: session.user.id,
    myWorkplace: null,
    organisationWide: false,
  })
  const { data: allAppointments = [] } = useAllAppointmentsQuery()
  const noteIndex = useProgressNoteIndexQuery(Boolean(session?.user?.id))

  const nextSession = upcoming[0] || null
  const timelineAppointments = upcoming.slice(0, 8)

  const notesByAppointment = useMemo(() => {
    const map = new Map()
    for (const note of noteIndex.data || []) {
      if (!note?.appointment_id) continue
      const current = map.get(note.appointment_id)
      if (!current || Number(note.note_number || 0) >= Number(current.note_number || 0)) {
        map.set(note.appointment_id, note)
      }
    }
    return map
  }, [noteIndex.data])

  const nextTask = useMemo(
    () => getNextProgressNoteTask(allAppointments, {
      getNote: (appointmentId) => (
        noteIndex.isSuccess
          ? notesByAppointment.get(appointmentId) || null
          : getProgressNoteByAppointment(appointmentId)
      ),
      today: todayYmd(),
    }),
    [allAppointments, noteIndex.isSuccess, notesByAppointment],
  )

  const nextTaskNote = nextTask
    ? (noteIndex.isSuccess
      ? notesByAppointment.get(nextTask.id) || null
      : getProgressNoteByAppointment(nextTask.id))
    : null
  const nextTaskHref = nextTask
    ? `/clients/${nextTask.client_id}/progress-notes?appointment=${nextTask.id}`
    : null

  const upcomingByClient = useMemo(
    () => nextSessionByClient(allAppointments, todayYmd()),
    [allAppointments],
  )

  const caseloadRows = useMemo(
    () => clients.filter((client) => client.is_active).map((client) => {
      const next = upcomingByClient.get(client.id) || null
      return {
        id: client.id,
        filterValues: { name: client.real_name },
        sortValues: {
          name: client.real_name,
          dob: client.dob || '',
          next: next ? appointmentInstant(next) : '',
        },
        cells: {
          name: <span className="record-table__primary">{client.real_name}</span>,
          dob: formatDisplayDate(client.dob) || '—',
          next: next ? (
            <button
              type="button"
              className="record-table__inline"
              onClick={(event) => {
                event.stopPropagation()
                overlay.openView(next)
              }}
            >
              {formatAppointmentDate(next)} · {formatAppointmentTime(next)}
            </button>
          ) : (
            <span className="record-table__cell-muted">None booked</span>
          ),
        },
      }
    }),
    [clients, upcomingByClient, overlay],
  )

  return (
    <div className="page page--home">
      <PageHeader title={name ? `Welcome back, ${name}` : 'Welcome'} />

      <div className="section-card-stack">
        <SectionCard
          blockId="clinician"
          actions={(
            <>
              <Link to="/calendar" className="secondary">Calendar</Link>
              <Link to="/calendar?view=upcoming" className="secondary">All upcoming</Link>
            </>
          )}
        >
          <div className="home-dashboard">
            <div className="home-dashboard__stats">
              <HomeStatCard title="Next session">
                {upcomingLoading && !nextSession ? (
                  <p className="section-card__empty">Loading schedule…</p>
                ) : nextSession ? (
                  <button
                    type="button"
                    className="home-stat-card__link"
                    onClick={() => overlay.openView(nextSession)}
                  >
                    <p className="home-stat-card__primary">
                      {clientLabel(clients, nextSession.client_id)}
                    </p>
                    <p className="home-stat-card__meta">
                      {formatAppointmentDate(nextSession)} · {formatAppointmentTime(nextSession)}
                    </p>
                    <p className="home-stat-card__meta">
                      {appointmentDisplayName(nextSession)}
                      {nextSession.location ? ` · ${nextSession.location}` : ''}
                    </p>
                  </button>
                ) : (
                  <p className="section-card__empty">No upcoming sessions on your diary.</p>
                )}
              </HomeStatCard>

              <HomeStatCard title="Next task">
                {noteIndex.isPending ? (
                  <p className="section-card__empty">Loading tasks…</p>
                ) : nextTask && nextTaskHref ? (
                  <Link
                    to={nextTaskHref}
                    className="home-stat-card__link"
                  >
                    <p className="home-stat-card__primary">
                      {nextTaskNote ? 'Finish Process Note' : 'Start Process Note'}
                    </p>
                    <p className="home-stat-card__meta">
                      {clientLabel(clients, nextTask.client_id)}
                      {' · '}
                      {formatSessionDateTime(nextTask) || appointmentSchedule(nextTask).session_date}
                    </p>
                    <p className="home-stat-card__meta">
                      {nextTaskNote?.title || appointmentDisplayName(nextTask, 'Session documentation')}
                    </p>
                  </Link>
                ) : (
                  <p className="section-card__empty">No Process Notes waiting — you&apos;re up to date.</p>
                )}
              </HomeStatCard>
            </div>

            <UpcomingTimeline
              appointments={timelineAppointments}
              clients={clients}
              onSelect={overlay.openView}
            />

            <section className="home-caseload" aria-labelledby="home-caseload-title">
              <div className="home-caseload__bar">
                <div>
                  <h3 id="home-caseload-title" className="card__title">Active cases</h3>
                  <p className="text-small text-muted">Your current clients. Open one to start work.</p>
                </div>
                <div className="home-caseload__actions">
                  <Link to="/clients" className="secondary">All clients</Link>
                  <Link to="/clients/add" className="primary">New client</Link>
                </div>
              </div>
              <RecordTable
                columns={CASELOAD_COLUMNS}
                rows={caseloadRows}
                defaultSort={{ key: 'next', direction: 'asc' }}
                countNoun="clients"
                scroll
                emptyMessage="No active clients yet."
                onRowClick={(row) => navigate(`/clients/${row.id}`)}
              />
            </section>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
