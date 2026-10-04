import { parseDiagnosisList } from '../../lib/diagnosisList'

function TagGroup({ label, tags }) {
  if (!tags.length) return null
  return (
    <div className="client-profile-summary__group">
      <span className="client-profile-summary__group-label">{label}</span>
      <div className="client-profile-summary__tags">
        {tags.map(tag => (
          <span key={tag} className="client-profile-summary__tag">{tag}</span>
        ))}
      </div>
    </div>
  )
}

function TextField({ label, value }) {
  if (!value?.trim()) return null
  return (
    <div className="client-profile-summary__group">
      <span className="client-profile-summary__group-label">{label}</span>
      <p className="client-profile-summary__text">{value}</p>
    </div>
  )
}

function hasProfileContent(client) {
  if (!client) return false
  const profile = client.clinical_profile || {}
  return Boolean(
    client.gender?.trim()
    || client.diagnosis?.trim()
    || client.school?.trim()
    || client.medication?.trim()
    || profile.working_formulation?.trim(),
  )
}

export default function ClientClinicalProfileSummary({ client }) {
  const profile = client?.clinical_profile || {}

  return (
    <div className="card client-profile-card">
      <h3 className="card__title">Clinical profile</h3>
      {!hasProfileContent(client) ? (
        <p className="text-muted text-small client-profile-card__empty">
          No clinical profile recorded yet. Use <strong>Edit profile</strong> in the header to add diagnosis and formulation.
        </p>
      ) : (
        <div className="client-profile-summary">
          <TextField label="Gender" value={client.gender} />
          <TextField label="School / setting" value={client.school} />
          {client.diagnosis && (
            <TagGroup label="Diagnosis" tags={parseDiagnosisList(client.diagnosis)} />
          )}
          <TextField label="Medication" value={client.medication} />
          {profile.working_formulation?.trim() && (
            <div className="client-profile-summary__formulation">
              <span className="client-profile-summary__group-label">Working formulation</span>
              <p className="client-profile-summary__formulation-text">{profile.working_formulation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
