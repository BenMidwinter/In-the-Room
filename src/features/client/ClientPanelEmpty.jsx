import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClientSession } from '../../lib/useClientSession'
import ClientTimeline from './ClientTimeline'
import ClientClinicalProfileSummary from './ClientClinicalProfileSummary'
import { getClientTimeline } from '../../lib/store'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { listClientActivity } from '../../lib/supabase/clientActivityRepo'
import { isSupabaseConfigured } from '../../lib/supabase/client'

export default function ClientPanelEmpty() {
  const { id: clientId } = useParams()
  const { client } = useClientSession()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)

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
      <section className="client-overview__profile" aria-label="Clinical profile">
        <ClientClinicalProfileSummary client={client} />
      </section>
      <section className="client-overview__timeline" aria-label="Client timeline">
        <ClientTimeline events={timeline} orientation="horizontal" />
      </section>
    </div>
  )
}
