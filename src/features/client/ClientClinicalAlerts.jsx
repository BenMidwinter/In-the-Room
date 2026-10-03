import { getClientClinicalAlerts } from '../../lib/intakeForm'

export default function ClientClinicalAlerts({ clientId }) {
  const alerts = getClientClinicalAlerts(clientId)
  if (!alerts.length) return null

  return (
    <div className="client-clinical-alerts" role="region" aria-label="Clinical alerts">
      {alerts.map(alert => (
        <span
          key={alert.id}
          className={`clinical-alert clinical-alert--${alert.level}`}
          title="From creative care intake form"
        >
          {alert.label}
        </span>
      ))}
    </div>
  )
}
