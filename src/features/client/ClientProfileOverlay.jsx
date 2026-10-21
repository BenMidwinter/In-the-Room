import { useEffect, useMemo, useState } from 'react'
import DiagnosisPicker from '../../components/DiagnosisPicker'
import FormOverlay from '../../components/FormOverlay'
import ClientConcessionForm from './ClientConcessionForm'
import { useConfirm, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { joinDiagnosisList, parseDiagnosisList } from '../../lib/diagnosisList'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { saveClinicalProfile, upsertClientRemote } from '../../lib/supabase/clientsRepo'
import { updateClientClinicalDetails, updateClientClinicalProfile } from '../../lib/store'

const TEXT_PROFILE_FIELDS = [
  {
    key: 'working_formulation',
    label: 'Working formulation',
    placeholder: 'Clinical hypothesis and formulation snapshot…',
    size: 'large',
    maxLength: 2000,
  },
]

function snapshotFromClient(client) {
  return {
    firstName: client.first_name || '',
    surname: client.surname || '',
    dob: client.dob || '',
    email: client.email || '',
    gender: client.gender || '',
    school: client.school || '',
    medication: client.medication || '',
    diagnoses: parseDiagnosisList(client.diagnosis),
    profile: client.clinical_profile || {},
  }
}

export default function ClientProfileOverlay({ client, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const initial = useMemo(() => snapshotFromClient(client), [client])
  const [firstName, setFirstName] = useState(initial.firstName)
  const [surname, setSurname] = useState(initial.surname)
  const [dob, setDob] = useState(initial.dob)
  const [email, setEmail] = useState(initial.email)
  const [gender, setGender] = useState(initial.gender)
  const [school, setSchool] = useState(initial.school)
  const [medication, setMedication] = useState(initial.medication)
  const [selectedDiagnoses, setSelectedDiagnoses] = useState(initial.diagnoses)
  const [profile, setProfile] = useState(initial.profile)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [localClient, setLocalClient] = useState(client)
  const [baseline, setBaseline] = useState(initial)

  useEffect(() => {
    const next = snapshotFromClient(client)
    setFirstName(next.firstName)
    setSurname(next.surname)
    setDob(next.dob)
    setEmail(next.email)
    setGender(next.gender)
    setSchool(next.school)
    setMedication(next.medication)
    setSelectedDiagnoses(next.diagnoses)
    setProfile(next.profile)
    setLocalClient(client)
    setBaseline(next)
  }, [client])

  const dirty = useMemo(() => {
    const current = {
      firstName,
      surname,
      dob,
      email,
      gender,
      school,
      medication,
      diagnoses: selectedDiagnoses,
      profile,
    }
    return JSON.stringify(current) !== JSON.stringify(baseline)
  }, [baseline, dob, email, firstName, gender, medication, profile, school, selectedDiagnoses, surname])

  const setProfileField = (key, value) => {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  const requestClose = async () => {
    if (!dirty) {
      onClose()
      return
    }
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      message: 'You have edited this client profile and have not saved. Close anyway?',
      confirmLabel: 'Discard changes',
      tone: 'danger',
    })
    if (ok) onClose()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    const details = {
      id: client.id,
      first_name: firstName.trim(),
      surname: surname.trim(),
      dob: dob.trim(),
      email: email.trim(),
      gender: gender.trim(),
      school: school.trim(),
      medication: medication.trim(),
      diagnosis: joinDiagnosisList(selectedDiagnoses),
    }
    try {
      let updated = localClient
      if (isSupabaseConfigured()) {
        if (!user?.id) throw new Error('Sign in required')
        updated = await upsertClientRemote(details, user.id)
        await saveClinicalProfile(client.id, profile)
      }
      updateClientClinicalDetails(client.id, details)
      updated = updateClientClinicalProfile(client.id, profile) || updated
      const nextClient = { ...updated, ...details, clinical_profile: profile }
      setLocalClient(nextClient)
      setBaseline(snapshotFromClient(nextClient))
      onSaved?.(nextClient)
      toast.success('Client profile saved.')
      onClose()
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormOverlay
      title="Edit client details"
      meta={`${firstName} ${surname}`.trim() || client.real_name}
      onClose={requestClose}
      size="lg"
      headerActions={(
        <>
          <button type="submit" form="client-profile-form" className="primary" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="secondary" onClick={requestClose} aria-label={dirty ? 'Close and discard unsaved changes' : 'Close'}>
            Close
          </button>
        </>
      )}
    >
      <form id="client-profile-form" onSubmit={handleSubmit} className="client-profile-overlay__form">
        {errors.form && (
          <p className="form-error" role="alert">{errors.form}</p>
        )}

        <section className="client-profile-overlay__section">
          <h3 className="client-profile-overlay__section-title">Identity</h3>
          <div className="client-profile-overlay__grid client-profile-overlay__grid--core">
            <div className="form-group client-profile-overlay__field">
              <label htmlFor="client-profile-first-name">First name</label>
              <input
                id="client-profile-first-name"
                className="paper-input"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </div>
            <div className="form-group client-profile-overlay__field">
              <label htmlFor="client-profile-surname">Surname</label>
              <input
                id="client-profile-surname"
                className="paper-input"
                value={surname}
                onChange={(event) => setSurname(event.target.value)}
                required
              />
            </div>
            <div className="form-group client-profile-overlay__field">
              <label htmlFor="client-profile-dob">Date of birth</label>
              <input
                id="client-profile-dob"
                type="date"
                className="paper-input"
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
            </div>
            <div className="form-group client-profile-overlay__field">
              <label htmlFor="client-profile-email">Email</label>
              <input
                id="client-profile-email"
                type="email"
                className="paper-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="form-group client-profile-overlay__field client-profile-overlay__field--gender">
              <label htmlFor="client-profile-gender">Gender</label>
              <input
                id="client-profile-gender"
                className="paper-input"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                placeholder="Optional"
                autoComplete="sex"
              />
            </div>
            <div className="form-group client-profile-overlay__field">
              <label htmlFor="client-profile-school">School / setting</label>
              <input
                id="client-profile-school"
                className="paper-input"
                value={school}
                onChange={(event) => setSchool(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="client-profile-overlay__section">
          <h3 className="client-profile-overlay__section-title">Clinical summary</h3>
          <div className="client-profile-overlay__grid client-profile-overlay__grid--core">
            <div className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
              <label>Diagnosis</label>
              <DiagnosisPicker selected={selectedDiagnoses} onChange={setSelectedDiagnoses} />
            </div>
            <div className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
              <label htmlFor="client-profile-medication">Medication</label>
              <textarea
                id="client-profile-medication"
                className="paper-input"
                value={medication}
                onChange={(event) => setMedication(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="client-profile-overlay__section">
          <h3 className="client-profile-overlay__section-title">Concession</h3>
          <ClientConcessionForm
            key={`${localClient.id}:${localClient.concession_kind}:${localClient.concession_percent}:${localClient.concession_pence}:${localClient.concession_label}`}
            client={localClient}
            onSaved={(fields) => {
              const next = { ...localClient, ...fields }
              setLocalClient(next)
              onSaved?.(next)
            }}
          />
        </section>

        <section className="client-profile-overlay__section client-profile-overlay__section--clinical">
          <h3 className="client-profile-overlay__section-title">Formulation</h3>
          <p className="client-profile-overlay__section-lead">
            Working formulation notes for this client.
          </p>
          <div className="client-profile-overlay__grid client-profile-overlay__grid--clinical">
            {TEXT_PROFILE_FIELDS.map(({ key, label, placeholder, size, maxLength }) => (
              <div key={key} className="form-group client-profile-overlay__field client-profile-overlay__field--wide">
                <label htmlFor={`client-profile-${key}`}>{label}</label>
                <textarea
                  id={`client-profile-${key}`}
                  className={`paper-input client-profile-overlay__textarea client-profile-overlay__textarea--${size}`}
                  value={profile[key] || ''}
                  onChange={(event) => setProfileField(key, event.target.value)}
                  placeholder={placeholder}
                  maxLength={maxLength}
                />
              </div>
            ))}
          </div>
        </section>
      </form>
    </FormOverlay>
  )
}
