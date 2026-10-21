import { useState, useEffect } from 'react'
import { Outlet, useLocation, matchPath } from 'react-router-dom'
import EditorInspector from '../../components/EditorInspector'
import { useAppSession } from '../../lib/AppSessionContext'
import { usePhoneLayout } from '../../lib/usePhoneLayout'
import { useAppClients } from '../../lib/queries'
import ClientDetailsBar from './ClientDetailsBar'
import ClientNav from './ClientNav'
import ClientDocumentsSubnav from './ClientDocumentsSubnav'
import { ClientChromeProvider, useClientChrome } from './ClientChrome'
import ClientClinicalAlerts from './ClientClinicalAlerts'
import ExportDialog from '../export/ExportDialog'

function PatientProfileFrame({ client: initialClient }) {
  const { editorOpen } = useClientChrome()
  const location = useLocation()
  const { session } = useAppSession()
  const { clients } = useAppClients()
  const [client, setClient] = useState(initialClient)
  const [exportOpen, setExportOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const phone = usePhoneLayout()
  const onDocuments = Boolean(matchPath(
    { path: '/clients/:clientId/documents', end: true },
    location.pathname,
  ))
  const onOverview = Boolean(matchPath(
    { path: '/clients/:id', end: true },
    location.pathname,
  ))

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

  const assignedElsewhere = Boolean(client.workplace_id && client.user_id !== session?.user?.id)

  return (
    <div className="page page--client">
      {!editorOpen && (
      <header className="client-shell__header">
        <div className="client-shell__identity">
          <div className="client-shell__title-row">
            <h1>
              {client.real_name}
            </h1>
            {phone && (
              <button
                type="button"
                className="editor-context-chip"
                aria-expanded={detailsOpen}
                aria-haspopup="dialog"
                onClick={() => setDetailsOpen(true)}
              >
                Details
              </button>
            )}
          </div>
          <p className="client-shell__subtitle">
            DOB {client.dob || '—'}
            {!phone && (
              <>
                {' · '}
                {client.gender?.trim() || 'Gender not recorded'}
                {assignedElsewhere ? ' · Assigned to another clinician' : ''}
              </>
            )}
          </p>
        </div>

        {!phone && !onOverview && (
          <ClientDetailsBar
            client={client}
            embedded
            onClientUpdated={handleClientUpdated}
          />
        )}

        {!phone && (
          <div className="client-shell__actions">
            <button type="button" className="secondary" onClick={() => setExportOpen(true)}>Export</button>
          </div>
        )}
      </header>
      )}

      {phone && !editorOpen && (
        <EditorInspector open={detailsOpen} title="Details" onClose={() => setDetailsOpen(false)}>
          {assignedElsewhere ? (
            <p className="editor-inspector__context text-small">Assigned to another clinician</p>
          ) : null}
          <ClientDetailsBar
            client={client}
            embedded
            onClientUpdated={handleClientUpdated}
          />
          <div className="editor-inspector__extras">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDetailsOpen(false)
                setExportOpen(true)
              }}
            >
              Export
            </button>
          </div>
        </EditorInspector>
      )}

      {!editorOpen && <ClientNav clientId={client.id} client={client} />}
      {!editorOpen && onDocuments && <ClientDocumentsSubnav />}

      {!editorOpen && <ClientClinicalAlerts clientId={client.id} />}

      {exportOpen && (
        <ExportDialog
          scope="client"
          clientId={client.id}
          onClose={() => setExportOpen(false)}
        />
      )}

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
