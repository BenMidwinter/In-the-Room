import { useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
import RoleBlockShell from '../../components/RoleBlockShell'
import BlurredName from '../../components/BlurredName'
import { usePermissions } from '../../lib/usePermissions'

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

function UpcomingTimeline({ appointments, clients, blurNames }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollLeft = 0
  }, [appointments])

  if (!appointments.length) {
    return (
      <p className="role-block__empty">
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
                <Link
                  to={blurNames ? '#' : `/clients/${appt.client_id}/appointments/${appt.id}`}
                  className="timeline__body home-upcoming-timeline__card"
                  onClick={blurNames ? (e) => e.preventDefault() : undefined}
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
                    <BlurredName name={clientLabel(clients, appt.client_id)} blur={blurNames} />
                  </p>
                  <p className="timeline__summary text-muted">
                    {service}
                    {appt.location ? ` · ${appt.location}` : ''}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { session, activePersona, myWorkplace } = useAppSession()
  const { clients } = useAppClients()
  const perms = usePermissions()
  const blurNames = perms.blurClientIdentity
  const name = activePersona?.name && activePersona.name !== 'Clinician'
    ? activePersona.name
    : null

  const { data: upcoming = [], isLoading: upcomingLoading } = useUpcomingAppointmentsQuery({
    userId: session.user.id,
    myWorkplace,
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

      <div className="role-block-stack">
        <RoleBlockShell
          blockId="clinician"
          actions={(
            <>
              <Link to="/calendar" className="secondary">Calendar</Link>
              <Link to="/upcoming-appointments" className="secondary">All upcoming</Link>
            </>
          )}
        >
          <div className="home-dashboard">
            <div className="home-dashboard__stats">
              <HomeStatCard title="Next session">
                {upcomingLoading && !nextSession ? (
                  <p className="role-block__empty">Loading schedule…</p>
                ) : nextSession ? (
                  <Link
                    to={blurNames ? '#' : `/clients/${nextSession.client_id}/appointments/${nextSession.id}`}
                    className="home-stat-card__link"
                    onClick={blurNames ? (e) => e.preventDefault() : undefined}
                  >
                    <p className="home-stat-card__primary">
                      <BlurredName name={clientLabel(clients, nextSession.client_id)} blur={blurNames} />
                    </p>
                    <p className="home-stat-card__meta">
                      {formatAppointmentDate(nextSession)} · {formatAppointmentTime(nextSession)}
                    </p>
                    <p className="home-stat-card__meta">
                      {appointmentDisplayName(nextSession)}
                      {nextSession.location ? ` · ${nextSession.location}` : ''}
                    </p>
                  </Link>
                ) : (
                  <p className="role-block__empty">No upcoming sessions on your diary.</p>
                )}
              </HomeStatCard>

              <HomeStatCard title="Next task">
                {nextTask && nextTaskHref ? (
                  <Link
                    to={blurNames ? '#' : nextTaskHref}
                    className="home-stat-card__link"
                    onClick={blurNames ? (e) => e.preventDefault() : undefined}
                  >
                    <p className="home-stat-card__primary">
                      {nextTaskNote ? 'Finish progress note' : 'Write progress note'}
                    </p>
                    <p className="home-stat-card__meta">
                      <BlurredName name={clientLabel(clients, nextTask.client_id)} blur={blurNames} />
                      {' · '}
                      {formatSessionDateTime(nextTask) || appointmentSchedule(nextTask).session_date}
                    </p>
                    <p className="home-stat-card__meta">
                      {nextTaskNote?.title || appointmentDisplayName(nextTask, 'Session documentation')}
                    </p>
                  </Link>
                ) : (
                  <p className="role-block__empty">No progress notes waiting — you&apos;re up to date.</p>
                )}
              </HomeStatCard>
            </div>

            <UpcomingTimeline
              appointments={timelineAppointments}
              clients={clients}
              blurNames={blurNames}
            />
          </div>
        </RoleBlockShell>
      </div>
    </div>
  )
}
