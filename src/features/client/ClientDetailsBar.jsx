import { useState } from 'react'
import { useAppSession } from '../../lib/AppSessionContext'
import { usePermissions } from '../../lib/usePermissions'
import ClientProfileOverlay from './ClientProfileOverlay'

export default function ClientDetailsBar({ client, onClientUpdated, embedded = false }) {
  const { refreshClients } = useAppSession()
  const perms = usePermissions(client)
  const [showEdit, setShowEdit] = useState(false)
  const items = [
    { label: 'Gender', value: client.gender || '—' },
    { label: 'School / setting', value: client.school || '—' },
    { label: 'Diagnosis', value: client.diagnosis || '—' },
    { label: 'Medication', value: client.medication || '—' },
    { label: 'Status', value: client.is_active ? 'Active' : 'Discharged' },
  ]

  const handleSaved = (updated) => {
    refreshClients?.()
    onClientUpdated?.(updated)
  }

  const bar = (
    <div className={`client-details-bar${embedded ? ' client-details-bar--embedded' : ' mb-1'}`}>
      <div className="client-details-bar__fields">
        {items.map(item => (
          <div key={item.label} className="client-details-bar__item">
            <span className="client-details-bar__label">{item.label}</span>
            <span className="client-details-bar__value">{item.value}</span>
          </div>
        ))}
      </div>
      {perms.canEditClientDetails && (
        <button
          type="button"
          className="secondary client-details-bar__edit"
          onClick={() => setShowEdit(true)}
        >
          Edit
        </button>
      )}
    </div>
  )

  return (
    <>
      {bar}

      {showEdit && (
        <ClientProfileOverlay
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
