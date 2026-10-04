import { useMemo, useRef, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { getProfile } from '../../lib/store'

const TYPE_LABELS = {
  created: 'Record',
  session: 'Session',
  support: 'Support / admin',
  referral: 'Referral',
  note: 'Process Note',
  document: 'Document',
  letter: 'Letter',
  report: 'Report',
  form: 'Form',
  event: 'Activity',
}

const TYPE_COLORS = {
  created: 'badge-blue',
  session: 'badge-green',
  support: 'badge-grey',
  referral: 'badge-grey',
  note: 'badge-blue',
  document: 'badge-grey',
  letter: 'badge-blue',
  report: 'badge-green',
  form: 'badge-blue',
  event: 'badge-grey',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ClientTimeline({ events = [], orientation = 'vertical' }) {
  const { id: routeClientId } = useParams()
  const overlay = useAppointmentOverlay()
  const scrollRef = useRef(null)
  const isHorizontal = orientation === 'horizontal'

  const eventHref = (event) => {
    const clientId = event.client_id || routeClientId
    if (!clientId || !event.ref_id) return null
    if (event.type === 'session' || event.type === 'support') {
      return `/clients/${clientId}/appointments/${event.ref_id}`
    }
    if (event.type === 'note') return `/clients/${clientId}/notes-history`
    if (event.type === 'letter') return `/clients/${clientId}/letters`
    if (event.type === 'document') return `/clients/${clientId}/documents`
    return null
  }

  const displayEvents = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )
    return isHorizontal ? sorted : [...sorted].reverse()
  }, [events, isHorizontal])

  useEffect(() => {
    if (!isHorizontal || !scrollRef.current) return
    const el = scrollRef.current
    el.scrollLeft = el.scrollWidth
  }, [displayEvents, isHorizontal])

  if (!events.length) {
    return (
      <div className={`card timeline-card${isHorizontal ? ' timeline-card--horizontal' : ''}`}>
        <h3 className="card__title">Timeline</h3>
        <p className="text-muted empty-state" style={{ padding: '1.5rem 0' }}>No timeline events yet.</p>
      </div>
    )
  }

  return (
    <div className={`card timeline-card${isHorizontal ? ' timeline-card--horizontal' : ''}`}>
      <div className="timeline-card__header">
        <h3 className="card__title">Timeline</h3>
      </div>
      <div
        ref={scrollRef}
        className={`timeline-card__scroll${isHorizontal ? ' timeline-card__scroll--horizontal' : ''}`}
      >
        <ul className={`timeline${isHorizontal ? ' timeline--horizontal' : ''}`}>
          {displayEvents.map((event, i) => {
            const author = getProfile(event.author_id)
            const isLast = i === displayEvents.length - 1
            return (
              <li key={event.id} className="timeline__item">
                {isHorizontal ? (
                  <div className="timeline__rail" aria-hidden>
                    <div className="timeline__marker" />
                    {!isLast && <div className="timeline__line timeline__line--horizontal" />}
                  </div>
                ) : (
                  <>
                    <div className="timeline__marker" aria-hidden />
                    {!isLast && <div className="timeline__line" aria-hidden />}
                  </>
                )}
                {(() => {
                  const href = eventHref(event)
                  const isAppointment = event.type === 'session' || event.type === 'support'
                  const Body = isAppointment ? 'button' : href ? Link : 'div'
                  const bodyProps = isAppointment
                    ? {
                      type: 'button',
                      className: 'timeline__body timeline__body--link',
                      onClick: () => overlay.openView(event.ref_id),
                    }
                    : href
                      ? { to: href, className: 'timeline__body timeline__body--link' }
                      : { className: 'timeline__body' }
                  return (
                    <Body {...bodyProps}>
                      <div className="timeline__meta">
                        <span className={`badge ${TYPE_COLORS[event.type] || 'badge-grey'}`}>
                          {TYPE_LABELS[event.type] || event.type}
                        </span>
                        <time className="text-small text-muted">{formatDate(event.created_at)}</time>
                      </div>
                      <p className="timeline__title">{event.title}</p>
                      {event.summary && <p className="timeline__summary text-muted">{event.summary}</p>}
                      {author && <p className="text-small text-muted">{author.full_name}</p>}
                    </Body>
                  )
                })()}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
