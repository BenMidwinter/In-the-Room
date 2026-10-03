import { ROLE_CAPABILITIES } from '../lib/permissions'

export default function RoleCapabilitiesBanner({ role }) {
  const caps = ROLE_CAPABILITIES[role]
  if (!caps) return null

  return (
    <details className="role-banner">
      <summary className="role-banner__summary-row">
        <span className="role-banner__badge">Demo view</span>
        <strong>{caps.label}</strong>
        <span className="role-banner__summary">{caps.summary}</span>
      </summary>
      <div className="role-banner__grid">
        <div>
          <p className="role-banner__label">Can do</p>
          <ul>
            {caps.can.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
        {caps.cannot.length > 0 && (
          <div>
            <p className="role-banner__label">Cannot do</p>
            <ul className="role-banner__cannot">
              {caps.cannot.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
