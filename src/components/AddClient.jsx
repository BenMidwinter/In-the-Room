import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppSession } from '../lib/AppSessionContext'
import DiagnosisPicker from './DiagnosisPicker'
import PageHeader from './PageHeader'
import { useToast } from './ui'
import { upsertClient, getClientById } from '../lib/store'
import { upsertClientRemote } from '../lib/supabase/clientsRepo'
import { isSupabaseConfigured } from '../lib/supabase/client'

export default function AddClient() {
  const navigate = useNavigate()
  const { clientId } = useParams()
  const { session, refreshClients } = useAppSession()
  const toast = useToast()
  const isEditMode = !!clientId

  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [dob, setDob] = useState('')
  const [school, setSchool] = useState('')
  const [selectedDiagnoses, setSelectedDiagnoses] = useState([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const clearError = (field) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))

  useEffect(() => {
    if (!isEditMode) return
    const existing = getClientById(clientId, session.user.id, null)
    if (!existing) {
      toast.error('Could not load client.')
      navigate('/clients')
      return
    }
    setFirstName(existing.first_name || '')
    setSurname(existing.surname || '')
    setDob(existing.dob || '')
    setSchool(existing.school || '')
    if (existing.diagnosis) {
      setSelectedDiagnoses(existing.diagnosis.split(',').map(s => s.trim()).filter(Boolean))
    }
  }, [clientId, isEditMode, session.user.id, navigate, toast])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = {}
    if (!firstName.trim()) nextErrors.firstName = 'First name is required.'
    if (!surname.trim()) nextErrors.surname = 'Surname is required.'
    if (!dob) nextErrors.dob = 'Date of birth is required.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const payload = {
        id: isEditMode ? clientId : undefined,
        first_name: firstName,
        surname,
        dob,
        school,
        diagnosis: selectedDiagnoses.join(', '),
        workplace_id: null,
      }
      if (isSupabaseConfigured()) {
        await upsertClientRemote(payload, session.user.id)
      } else {
        upsertClient(payload, session.user.id)
      }
      refreshClients()
      toast.success(isEditMode ? 'Client updated.' : 'Client added.')
      navigate('/clients')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={isEditMode ? 'Edit client' : 'New client'}
        subtitle={isEditMode ? 'Update client record details.' : 'Add a client to your caseload.'}
        actions={<button type="button" className="secondary" onClick={() => navigate('/clients')}>Cancel</button>}
      />

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '560px' }} noValidate>
        {errors.form && (
          <p className="mb-4 border border-secondary border-l-4 bg-secondary/5 px-3 py-2 text-[0.85rem] text-secondary-dark" role="alert">
            {errors.form}
          </p>
        )}
        <div className="form-grid">
          <div className="form-group">
            <label>First name</label>
            <input
              className="paper-input"
              value={firstName}
              onChange={e => { setFirstName(e.target.value); clearError('firstName') }}
              aria-invalid={!!errors.firstName}
            />
            {errors.firstName && <p className="mt-1 text-[0.8rem] text-secondary">{errors.firstName}</p>}
          </div>
          <div className="form-group">
            <label>Surname</label>
            <input
              className="paper-input"
              value={surname}
              onChange={e => { setSurname(e.target.value); clearError('surname') }}
              aria-invalid={!!errors.surname}
            />
            {errors.surname && <p className="mt-1 text-[0.8rem] text-secondary">{errors.surname}</p>}
          </div>
        </div>
        <div className="form-group">
          <label>Date of birth</label>
          <input
            type="date"
            className="paper-input"
            value={dob}
            onChange={e => { setDob(e.target.value); clearError('dob') }}
            aria-invalid={!!errors.dob}
          />
          {errors.dob && <p className="mt-1 text-[0.8rem] text-secondary">{errors.dob}</p>}
        </div>
        <div className="form-group">
          <label>School / setting</label>
          <input className="paper-input" value={school} onChange={e => setSchool(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Diagnosis</label>
          <DiagnosisPicker selected={selectedDiagnoses} onChange={setSelectedDiagnoses} />
        </div>
        <div className="form-group">
          <label>Context</label>
          <p className="text-muted">Private practice</p>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={loading}>{loading ? 'Saving…' : 'Save client'}</button>
        </div>
      </form>
    </div>
  )
}
