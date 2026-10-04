import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClientSession } from '../../lib/useClientSession'
import ClientTimeline from './ClientTimeline'
import { getClientTimeline } from '../../lib/store'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { listClientActivity } from '../../lib/supabase/clientActivityRepo'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { formatSessionDateTime, splitLastAndNextAppointments } from '../../lib/appointmentUtils'

function VisitBox({ label, empty, appointment, onOpen }) {
  const when = appointment ? formatSessionDateTime(appointment) : ''
  return (
    <button
      type="button"
      className="client-visit-card"
      onClick={() => appointment && onOpen(appointment)}
      disabled={!appointment}
    >
      <span className="client-visit-card__label">{label}</span>
      <strong className="client-visit-card__when">{when || empty}</strong>
      <span className="client-visit-card__service">{appointment?.service_name || ' '}</span>
    </button>
  )
}

export default function ClientPanelEmpty() {
  const { id: clientId } = useParams()
  const overlay = useAppointmentOverlay()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)
  const visits = useMemo(
    () => splitLastAndNextAppointments(appointments),
    [appointments],
  )

  const activityQuery = useQuery({
    queryKey: ['client-activity', clientId],
    enabled: Boolean(clientId) && isSupabaseConfigured(),
    queryFn: () => listClientActivity(clientId),
    staleTime: 30_000,
  })

  const timeline = useMemo(
    () => getClientTimeline(clientId, {
      appointments,
      activity: activityQuery.data || [],
    }),
    [clientId, appointments, activityQuery.data],
  )

  return (
    <div className="client-overview">
      <section className="client-overview__visits" aria-label="Appointments">
        <VisitBox
          label="Last appointment"
          empty="No previous appointment"
          appointment={visits.last}
          onOpen={overlay.openView}
        />
        <VisitBox
          label="Next appointment"
          empty="No upcoming appointment"
          appointment={visits.next}
          onOpen={overlay.openView}
        />
      </section>
      <section className="client-overview__timeline" aria-label="Client timeline">
        <ClientTimeline events={timeline} orientation="horizontal" />
      </section>
    </div>
  )
}
