import { Link } from 'react-router-dom'
import { useAppSession } from '../lib/AppSessionContext'
import { useAppClients } from '../lib/queries'
import PageHeader from './PageHeader'
import { APPOINTMENT_TYPES } from '../lib/store'
import { useUpcomingAppointmentsQuery } from '../lib/appointmentQueries'
import {
  groupAppointmentsForAgenda,
  formatAppointmentTime,
  formatAppointmentDate,
  attendanceLabel,
  attendanceBadgeClass,
} from '../lib/appointmentUtils'
import { usePermissions } from '../lib/usePermissions'
import BlurredName from './BlurredName'

function AgendaEvent({ appt, clientName, blurNames }) {
  return (
    <Link
      to={blurNames ? '#' : `/clients/${appt.client_id}/appointments/${appt.id}`}
      className="agenda-event"
      onClick={blurNames ? e => e.preventDefault() : undefined}
    >
      <time className="agenda-event__time" dateTime={appt.scheduled_at}>
        {formatAppointmentTime(appt.scheduled_at)}
      </time>
      <div className="agenda-event__body">
        <span className="agenda-event__client">
          <BlurredName name={clientName} blur={blurNames} />
        </span>
        <span className="agenda-event__meta">
          {APPOINTMENT_TYPES[appt.appointment_type]}
          {appt.location && ` · ${appt.location}`}
        </span>
      </div>
      <span className={`badge agenda-event__badge ${attendanceBadgeClass(appt.attendance_status)}`}>
        {attendanceLabel(appt.attendance_status)}
      </span>
    </Link>
  )
}

function LaterGroup({ items, clientName, blurNames }) {
  if (!items.length) return null

  const byDate = items.reduce((acc, appt) => {
    const key = formatAppointmentDate(appt.scheduled_at)
    if (!acc[key]) acc[key] = []
    acc[key].push(appt)
    return acc
  }, {})

  return (
    <section className="agenda-day agenda-day--later">
      <header className="agenda-day__header">
        <h2 className="agenda-day__title">Later</h2>
      </header>
      {Object.entries(byDate).map(([dateLabel, dayItems]) => (
        <div key={dateLabel} className="agenda-later-group">
          <h3 className="agenda-later-group__date">{dateLabel}</h3>
          <ul className="agenda-day__events">
            {dayItems.map(appt => (
              <li key={appt.id}>
                <AgendaEvent appt={appt} clientName={clientName(appt.client_id)} blurNames={blurNames} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default function UpcomingAppointments() {
  const { session, myWorkplace } = useAppSession()
  const { clients } = useAppClients()
  const perms = usePermissions()
  const { data: upcoming = [] } = useUpcomingAppointmentsQuery({
    userId: session.user.id,
    myWorkplace,
    organisationWide: perms.isServiceLeadView,
  })
  const sections = groupAppointmentsForAgenda(upcoming)

  const clientName = (clientId) => clients.find(c => c.id === clientId)?.real_name || 'Unknown client'

  const todaySection = sections.find(s => s.key === 'today')
  const tomorrowSection = sections.find(s => s.key === 'tomorrow')
  const laterSection = sections.find(s => s.key === 'later')

  return (
    <div className="page">
      <PageHeader
        title="Upcoming appointments"
        subtitle="Your schedule for today, tomorrow, and beyond."
      />

      {upcoming.length === 0 ? (
        <div className="card empty-state">No upcoming appointments scheduled.</div>
      ) : (
        <div className="agenda-calendar">
          {[todaySection, tomorrowSection].map(section => (
            <section key={section.key} className="agenda-day">
              <header className="agenda-day__header">
                <h2 className="agenda-day__title">{section.heading}</h2>
              </header>
              {section.items.length === 0 ? (
                <p className="agenda-day__empty">Nothing scheduled</p>
              ) : (
                <ul className="agenda-day__events">
                  {section.items.map(appt => (
                    <li key={appt.id}>
                      <AgendaEvent appt={appt} clientName={clientName(appt.client_id)} blurNames={perms.blurClientIdentity} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <LaterGroup items={laterSection.items} clientName={clientName} blurNames={perms.blurClientIdentity} />
        </div>
      )}
    </div>
  )
}
