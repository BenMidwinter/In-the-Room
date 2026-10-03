import { useMemo } from 'react'
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
import { modalityLabel } from '../../lib/calendarConstants'
import { todayYmd } from '../../lib/dateArchitecture'
import PageHeader from '../../components/PageHeader'
import RoleBlockShell from '../../components/RoleBlockShell'
import BlurredName from '../../components/BlurredName'
import { usePermissions } from '../../lib/usePermissions'

function clientLabel(clients, clientId) {
  return clients.find((c) => c.id === clientId)?.real_name || 'Client'
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
  const laterUpcoming = upcoming.slice(0, 6)

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
              <Link to="/calendar" className="role-block__link">Calendar</Link>
              <Link to="/upcoming-appointments" className="role-block__link">All upcoming</Link>
            </>
          )}
        >
          <div className="role-block__columns">
            <div className="role-block__panel">
              <h3 className="role-block__panel-title">Next session</h3>
              {upcomingLoading && !nextSession ? (
                <p className="role-block__empty">Loading schedule…</p>
              ) : nextSession ? (
                <Link
                  to={blurNames ? '#' : `/clients/${nextSession.client_id}/appointments/${nextSession.id}`}
                  className="home-feed__row"
                  onClick={blurNames ? (e) => e.preventDefault() : undefined}
                >
                  <span className="home-feed__date">{formatAppointmentDate(nextSession)}</span>
                  <span className="home-feed__time">{formatAppointmentTime(nextSession)}</span>
                  <span className="home-feed__primary">
                    <BlurredName name={clientLabel(clients, nextSession.client_id)} blur={blurNames} />
                  </span>
                  <span className="home-feed__meta">
                    {modalityLabel(nextSession.therapy_modality) || nextSession.service_name || 'Session'}
                    {nextSession.location ? ` · ${nextSession.location}` : ''}
                  </span>
                </Link>
              ) : (
                <p className="role-block__empty">No upcoming sessions on your diary.</p>
              )}
            </div>

            <div className="role-block__panel">
              <h3 className="role-block__panel-title">Next task</h3>
              {nextTask && nextTaskHref ? (
                <Link to={blurNames ? '#' : nextTaskHref} className="home-feed__row home-feed__row--button" onClick={blurNames ? (e) => e.preventDefault() : undefined}>
                  <span className="home-feed__primary">
                    {nextTaskNote ? 'Finish progress note' : 'Write progress note'}
                    {' · '}
                    <BlurredName name={clientLabel(clients, nextTask.client_id)} blur={blurNames} />
                  </span>
                  <span className="home-feed__date">
                    {formatSessionDateTime(nextTask) || appointmentSchedule(nextTask).session_date}
                  </span>
                  <span className="home-feed__meta">
                    {nextTaskNote?.title || modalityLabel(nextTask.therapy_modality) || 'Session documentation'}
                  </span>
                </Link>
              ) : (
                <p className="role-block__empty">No progress notes waiting — you&apos;re up to date.</p>
              )}
            </div>
          </div>

          <div className="role-block__panel">
            <h3 className="role-block__panel-title">Upcoming appointments</h3>
            {laterUpcoming.length === 0 ? (
              <p className="role-block__empty">
                Nothing scheduled yet.{' '}
                <Link to="/calendar">Open the calendar</Link>
                {' '}to book a session, or{' '}
                <Link to="/clients/add">add a client</Link>.
              </p>
            ) : (
              <ul className="home-feed">
                {laterUpcoming.map((appt) => (
                  <li key={appt.id} className="home-feed__item">
                    <Link
                      to={blurNames ? '#' : `/clients/${appt.client_id}/appointments/${appt.id}`}
                      className="home-feed__row"
                      onClick={blurNames ? (e) => e.preventDefault() : undefined}
                    >
                      <span className="home-feed__date">{formatAppointmentDate(appt)}</span>
                      <span className="home-feed__time">{formatAppointmentTime(appt)}</span>
                      <span className="home-feed__primary">
                        <BlurredName name={clientLabel(clients, appt.client_id)} blur={blurNames} />
                      </span>
                      <span className="home-feed__meta">
                        {modalityLabel(appt.therapy_modality) || appt.service_name || 'Session'}
                        {appt.location ? ` · ${appt.location}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 6 && (
              <Link to="/upcoming-appointments" className="role-block__link role-block__link--footer">
                View all upcoming
              </Link>
            )}
          </div>
        </RoleBlockShell>
      </div>
    </div>
  )
}
