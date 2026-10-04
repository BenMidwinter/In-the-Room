import { useState, useEffect } from 'react'
import DiagnosisPicker from '../../components/DiagnosisPicker'
import { updateClientClinicalDetails, updateClientClinicalProfile } from '../../lib/store'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { patchClientIdentity } from '../../lib/supabase/clientsRepo'
import { useToast } from '../../components/ui'
import { joinDiagnosisList, parseDiagnosisList } from '../../lib/diagnosisList'

const TEXT_PROFILE_FIELDS = [
  {
    key: 'working_formulation',
    label: 'Working formulation',
    placeholder: 'Clinical hypothesis and formulation snapshot…',
    size: 'large',
  },
]

export default function ClientProfileOverlay({ client, onClose, onSaved }) {
  const [gender, setGender] = useState(client.gender || '')
  const [school, setSchool] = useState(client.school || '')
  const [medication, setMedication] = useState(client.medication || '')
  const [selectedDiagnoses, setSelectedDiagnoses] = useState([])
  const [profile, setProfile] = useState(client.clinical_profile || {})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const toast = useToast()

  useEffect(() => {
    setGender(client.gender || '')
    setSchool(client.school || '')
    setMedication(client.medication || '')
    setSelectedDiagnoses(parseDiagnosisList(client.diagnosis))
    setProfile(client.clinical_profile || {})
  }, [client])

  const setProfileField = (key, value) => {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const details = {
      gender: gender.trim(),
      school: school.trim(),
      medication: medication.trim(),
      diagnosis: joinDiagnosisList(selectedDiagnoses),
    }
    try {
      if (isSupabaseConfigured()) await patchClientIdentity(client.id, details)
      updateClientClinicalDetails(client.id, details)
      const updated = updateClientClinicalProfile(client.id, profile)
      onSaved?.(updated)
      toast.success('Clinical profile saved.')
      onClose()
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="client-profile-overlay" role="presentation">
      <button type="button" className="client-profile-overlay__backdrop" onClick={onClose} aria-label="Close overlay" />
      <div
        className="client-profile-overlay__panel"
        role="dialog"
        aria-labelledby="client-profile-overlay-title"
      >
        <header className="client-profile-overlay__header">
          <div className="client-profile-overlay__intro">
            <p className="client-profile-overlay__eyebrow">Client clinical profile</p>
            <h2 id="client-profile-overlay-title" className="client-profile-overlay__title">{client.real_name}</h2>
            <p className="client-profile-overlay__meta">
              DOB {client.dob || '—'}
              {' · '}
              {gender.trim() || 'Gender not recorded'}
            </p>
          </div>
          <button type="button" className="client-profile-overlay__close secondary" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <form onSubmit={handleSubmit} className="client-profile-overlay__form">
          {errors.form && (
            <p className="form-error" role="alert" style={{ margin: '0 0 1rem' }}>{errors.form}</p>
          )}
          <section className="client-profile-overlay__section">
            <h3 className="client-profile-overlay__section-title">Core details</h3>
            <div className="client-profile-overlay__grid client-profile-overlay__grid--core">
              <div className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
                <label htmlFor="client-profile-gender">Gender</label>
                <input
                  id="client-profile-gender"
                  className="paper-input client-profile-overlay__input"
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
                <label htmlFor="client-profile-school">School / setting</label>
                <input
                  id="client-profile-school"
                  className="paper-input client-profile-overlay__input"
                  value={school}
                  onChange={e => setSchool(e.target.value)}
                />
              </div>
              <div className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
                <label>Diagnosis</label>
                <DiagnosisPicker selected={selectedDiagnoses} onChange={setSelectedDiagnoses} />
              </div>
              <div className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
                <label htmlFor="client-profile-medication">Medication</label>
                <textarea
                  id="client-profile-medication"
                  className="paper-input client-profile-overlay__input client-profile-overlay__textarea client-profile-overlay__textarea--short"
                  value={medication}
                  onChange={e => setMedication(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="client-profile-overlay__section client-profile-overlay__section--clinical">
            <h3 className="client-profile-overlay__section-title">Formulation</h3>
            <p className="client-profile-overlay__section-lead">
              Working formulation notes for this client. Keep identifying detail encrypted before save in production.
            </p>
            <div className="client-profile-overlay__grid client-profile-overlay__grid--clinical">
              {TEXT_PROFILE_FIELDS.map(({ key, label, placeholder, size }) => (
                <div key={key} className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
                  <label htmlFor={`client-profile-${key}`}>{label}</label>
                  <textarea
                    id={`client-profile-${key}`}
                    className={`paper-input client-profile-overlay__input client-profile-overlay__textarea client-profile-overlay__textarea--${size}`}
                    value={profile[key] || ''}
                    onChange={e => setProfileField(key, e.target.value)}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </section>

          <footer className="client-profile-overlay__actions form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
