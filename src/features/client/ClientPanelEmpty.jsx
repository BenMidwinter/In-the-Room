import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClientSession } from '../../lib/useClientSession'
import SectionCard from '../../components/SectionCard'
import ClientDetailsBar from './ClientDetailsBar'
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
  const { client } = useClientSession()
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
      <div className="tray-grid">
        <SectionCard blockId="client-details" title="Details">
          {client ? (
            <>
              <ClientDetailsBar client={client} embedded />
              <div className="client-details__formulation">
                <p className="client-details__formulation-label">Formulation</p>
                <p className="client-details__formulation-text">
                  {client.clinical_profile?.working_formulation?.trim()
                    || 'No formulation recorded yet.'}
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted">Loading details…</p>
          )}
        </SectionCard>
        <SectionCard blockId="client-sessions" title="Sessions">
          <div className="client-overview__visits">
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
          </div>
        </SectionCard>
      </div>
      <SectionCard blockId="client-timeline" title="Timeline">
        <ClientTimeline events={timeline} orientation="horizontal" />
      </SectionCard>
    </div>
  )
}
