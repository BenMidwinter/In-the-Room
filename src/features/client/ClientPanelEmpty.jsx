import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import ClientTimeline from './ClientTimeline'
import ClientClinicalProfileSummary from './ClientClinicalProfileSummary'
import { getClientTimeline } from '../../lib/store'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'

export default function ClientPanelEmpty() {
  const { id: clientId } = useParams()
  const { client } = useClientSession()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)

  const timeline = useMemo(
    () => getClientTimeline(clientId, { appointments }),
    [clientId, appointments],
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
