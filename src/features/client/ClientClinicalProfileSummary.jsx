import {
  CLINICAL_PROFILE_FIELDS,
  tagsFromProfileValue,
} from '../../lib/clinicalProfile'

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
    client.diagnosis?.trim()
    || client.school?.trim()
    || client.medication?.trim()
    || profile.working_formulation?.trim()
    || tagsFromProfileValue(profile.sensory_considerations).length
    || tagsFromProfileValue(profile.recurring_themes).length
    || tagsFromProfileValue(profile.clinical_goals).length
    || tagsFromProfileValue(profile.preferred_modalities_notes).length,
  )
}

export default function ClientClinicalProfileSummary({ client }) {
  const profile = client?.clinical_profile || {}

  return (
    <div className="card client-profile-card">
      <h3 className="card__title">Clinical profile</h3>
      {!hasProfileContent(client) ? (
        <p className="text-muted text-small client-profile-card__empty">
          No clinical profile recorded yet. Use <strong>Edit profile</strong> in the header to add diagnosis, sensory tags, and goals.
        </p>
      ) : (
        <div className="client-profile-summary">
          <TextField label="School / setting" value={client.school} />
          {client.diagnosis && (
            <TagGroup label="Diagnosis" tags={tagsFromProfileValue(client.diagnosis)} />
          )}
          <TextField label="Medication" value={client.medication} />
          <TagGroup
            label={CLINICAL_PROFILE_FIELDS.sensory_considerations.label}
            tags={tagsFromProfileValue(profile.sensory_considerations)}
          />
          <TagGroup
            label={CLINICAL_PROFILE_FIELDS.recurring_themes.label}
            tags={tagsFromProfileValue(profile.recurring_themes)}
          />
          <TagGroup
            label={CLINICAL_PROFILE_FIELDS.clinical_goals.label}
            tags={tagsFromProfileValue(profile.clinical_goals)}
          />
          <TagGroup
            label={CLINICAL_PROFILE_FIELDS.preferred_modalities_notes.label}
            tags={tagsFromProfileValue(profile.preferred_modalities_notes)}
          />
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
