import { useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { useAppSession } from '../../lib/AppSessionContext'
import { useAppClients } from '../../lib/queries'
import { useUpcomingAppointmentsQuery, useAllAppointmentsQuery } from '../../lib/appointmentQueries'
import { getProgressNoteByAppointment } from '../../lib/store'
import { getNextProgressNoteTask } from '../../lib/homeBlocks'
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatSessionDateTime,
  appointmentSchedule,
} from '../../lib/appointmentUtils'
import { appointmentDisplayName } from '../../lib/calendarServiceStyles'
import { todayYmd } from '../../lib/dateArchitecture'
import PageHeader from '../../components/PageHeader'
import SectionCard from '../../components/SectionCard'

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
        <p className="timeline-card__hint text-small text-muted">
          Earliest on the left — scroll for later sessions
        </p>
      </div>
      <div ref={scrollRef} className="timeline-card__scroll timeline-card__scroll--horizontal">
        <ul className="timeline timeline--horizontal">
          {appointments.map((appt, i) => {
            const isLast = i === appointments.length - 1
            const service = appointmentDisplayName(appt)
            return (
              <li key={appt.id} className="timeline__item">
                <div className="timeline__rail" aria-hidden>
                  <div className="timeline__marker" />
                  {!isLast && <div className="timeline__line timeline__line--horizontal" />}
                </div>
                <button
                  type="button"
                  className="timeline__body timeline__body--link home-upcoming-timeline__card"
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

  const nextSession = upcoming[0] || null
  const timelineAppointments = upcoming.slice(0, 8)

  const nextTask = useMemo(
    () => getNextProgressNoteTask(allAppointments, {
      getNote: getProgressNoteByAppointment,
      today: todayYmd(),
    }),
    [allAppointments],
  )

  const nextTaskNote = nextTask ? getProgressNoteByAppointment(nextTask.id) : null
  const nextTaskHref = nextTask
    ? `/clients/${nextTask.client_id}/progress-notes?appointment=${nextTask.id}`
    : null

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
                {nextTask && nextTaskHref ? (
                  <Link
                    to={nextTaskHref}
                    className="home-stat-card__link"
                  >
                    <p className="home-stat-card__primary">
                      {nextTaskNote ? 'Finish progress note' : 'Write progress note'}
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
                  <p className="section-card__empty">No progress notes waiting — you&apos;re up to date.</p>
                )}
              </HomeStatCard>
            </div>

            <UpcomingTimeline
              appointments={timelineAppointments}
              clients={clients}
              onSelect={overlay.openView}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
