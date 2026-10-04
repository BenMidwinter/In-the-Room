import { useAppSession } from '../lib/AppSessionContext'
import { useAppClients } from '../lib/queries'
import { APPOINTMENT_TYPES } from '../lib/store'
import { useUpcomingAppointmentsQuery } from '../lib/appointmentQueries'
import {
  groupAppointmentsForAgenda,
  formatAppointmentTime,
  formatAppointmentDate,
  attendanceLabel,
  attendanceBadgeClass,
} from '../lib/appointmentUtils'

function AgendaEvent({ appt, clientName, onSelect }) {
  return (
    <button
      type="button"
      className="agenda-event"
      onClick={() => onSelect?.(appt)}
    >
      <time className="agenda-event__time" dateTime={appt.scheduled_at}>
        {formatAppointmentTime(appt.scheduled_at)}
      </time>
      <div className="agenda-event__body">
        <span className="agenda-event__client">
          {clientName}
        </span>
        <span className="agenda-event__meta">
          {APPOINTMENT_TYPES[appt.appointment_type]}
          {appt.location && ` · ${appt.location}`}
        </span>
      </div>
      <span className={`badge agenda-event__badge ${attendanceBadgeClass(appt.attendance_status)}`}>
        {attendanceLabel(appt.attendance_status)}
      </span>
    </button>
  )
}

function LaterGroup({ items, clientName, onSelect }) {
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
                <AgendaEvent appt={appt} clientName={clientName(appt.client_id)} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default function UpcomingAppointments({ onSelect }) {
  const { session } = useAppSession()
  const { clients } = useAppClients()
  const { data: upcoming = [] } = useUpcomingAppointmentsQuery({
    userId: session.user.id,
    myWorkplace: null,
    organisationWide: false,
  })
  const sections = groupAppointmentsForAgenda(upcoming)

  const clientName = (clientId) => clients.find(c => c.id === clientId)?.real_name || 'Unknown client'

  const todaySection = sections.find(s => s.key === 'today')
  const tomorrowSection = sections.find(s => s.key === 'tomorrow')
  const laterSection = sections.find(s => s.key === 'later')

  return (
    <div className="calendar-upcoming">
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
                      <AgendaEvent appt={appt} clientName={clientName(appt.client_id)} onSelect={onSelect} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <LaterGroup items={laterSection.items} clientName={clientName} onSelect={onSelect} />
        </div>
      )}
    </div>
  )
}
