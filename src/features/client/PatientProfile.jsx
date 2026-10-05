import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAppSession } from '../../lib/AppSessionContext'
import { useAppClients } from '../../lib/queries'
import ClientDetailsBar from './ClientDetailsBar'
import ClientNav from './ClientNav'
import { ClientChromeProvider, useClientChrome } from './ClientChrome'
import ClientClinicalAlerts from './ClientClinicalAlerts'
import ClientConcessionForm from './ClientConcessionForm'

function PatientProfileFrame({ client: initialClient }) {
  const { editorOpen } = useClientChrome()
  const navigate = useNavigate()
  const { session } = useAppSession()
  const { clients } = useAppClients()
  const [client, setClient] = useState(initialClient)

  useEffect(() => {
    setClient(initialClient)
  }, [initialClient])

  useEffect(() => {
    const fresh = clients?.find(c => c.id === initialClient.id)
    if (fresh) setClient(fresh)
  }, [clients, initialClient.id])

  const handleClientUpdated = (updated) => {
    if (updated) setClient(updated)
  }

  const assignmentHint = client.workplace_id && client.user_id !== session?.user?.id
    ? ' · Assigned to another clinician'
    : ''

  return (
    <div className="page page--client">
      {!editorOpen && (
      <header className="client-shell__header">
        <div className="client-shell__identity">
          <h1>
            {client.real_name}
          </h1>
          <p className="client-shell__subtitle">
            DOB {client.dob || '—'}
            {' · '}
            {client.gender?.trim() || 'Gender not recorded'}
            {assignmentHint}
          </p>
        </div>

        <ClientDetailsBar
          client={client}
          embedded
          onClientUpdated={handleClientUpdated}
        />

        <div className="client-shell__actions">
          <button type="button" className="secondary" onClick={() => navigate('/home')}>Home</button>
        </div>
      </header>
      )}

      {!editorOpen && (
        <ClientConcessionForm
          key={`${client.id}:${client.concession_kind}:${client.concession_percent}:${client.concession_pence}:${client.concession_label}`}
          client={client}
          onSaved={(fields) => handleClientUpdated({ ...client, ...fields })}
        />
      )}

      {!editorOpen && <ClientNav clientId={client.id} client={client} />}

      {!editorOpen && <ClientClinicalAlerts clientId={client.id} />}

      <div className={`client-layout${editorOpen ? ' client-layout--writing' : ''}`}>
        <div className="client-layout__main">
          <Outlet context={{ client }} />
        </div>
      </div>

    </div>
  )
}

export default function PatientProfile(props) {
  return (
    <ClientChromeProvider>
      <PatientProfileFrame {...props} />
    </ClientChromeProvider>
  )
}
