import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppSession } from '../lib/AppSessionContext'
import DiagnosisPicker from './DiagnosisPicker'
import PageHeader from './PageHeader'
import { usePermissions } from '../lib/usePermissions'
import { useToast } from './ui'
import { getWorkplacesForUser, upsertClient, getClientById } from '../lib/store'

export default function AddClient() {
  const navigate = useNavigate()
  const { clientId } = useParams()
  const { session, myWorkplace, refreshClients } = useAppSession()
  const perms = usePermissions()
  const toast = useToast()
  const isEditMode = !!clientId

  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [dob, setDob] = useState('')
  const [school, setSchool] = useState('')
  const [selectedDiagnoses, setSelectedDiagnoses] = useState([])
  const [myWorkplaces, setMyWorkplaces] = useState([])
  const [selectedWorkplaceId, setSelectedWorkplaceId] = useState('private')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const clearError = (field) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))

  useEffect(() => {
    setMyWorkplaces(getWorkplacesForUser(session.user.id))
  }, [session.user.id])

  useEffect(() => {
    if (isEditMode) return
    if (perms.canAddPrivateClient) {
      setSelectedWorkplaceId('private')
    } else if (perms.canAddWorkplaceClient && myWorkplaces.length) {
      setSelectedWorkplaceId(myWorkplaces[0].id)
    }
  }, [isEditMode, perms.canAddPrivateClient, perms.canAddWorkplaceClient, myWorkplaces])

  useEffect(() => {
    if (!isEditMode) return
    const existing = getClientById(clientId, session.user.id, myWorkplace)
    if (!existing) {
      toast.error('Could not load client.')
      navigate('/clients')
      return
    }
    setFirstName(existing.first_name || '')
    setSurname(existing.surname || '')
    setDob(existing.dob || '')
    setSchool(existing.school || '')
    setSelectedWorkplaceId(existing.workplace_id || 'private')
    if (existing.diagnosis) {
      setSelectedDiagnoses(existing.diagnosis.split(',').map(s => s.trim()).filter(Boolean))
    }
  }, [clientId, isEditMode, session.user.id, myWorkplace, navigate, toast])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = {}
    if (!firstName.trim()) nextErrors.firstName = 'First name is required.'
    if (!surname.trim()) nextErrors.surname = 'Surname is required.'
    if (!dob) nextErrors.dob = 'Date of birth is required.'
    if (selectedWorkplaceId === 'private' && !perms.canAddPrivateClient) {
      nextErrors.form = 'Your role cannot add private practice clients.'
    } else if (selectedWorkplaceId !== 'private' && !perms.canAddWorkplaceClient) {
      nextErrors.form = 'Your role cannot add workplace clients.'
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      upsertClient({
        id: isEditMode ? clientId : undefined,
        first_name: firstName,
        surname,
        dob,
        school,
        diagnosis: selectedDiagnoses.join(', '),
        workplace_id: selectedWorkplaceId === 'private' ? null : selectedWorkplaceId,
      }, session.user.id)
      refreshClients()
      toast.success(isEditMode ? 'Client updated.' : 'Client added.')
      navigate('/clients')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isEditMode && !perms.canAddPrivateClient && !perms.canAddWorkplaceClient) {
    return (
      <div className="page">
        <PageHeader title="New client" subtitle="Add a client to your caseload." />
        <div className="card permission-notice">
          <p><strong>Your current role cannot add new clients.</strong></p>
          <p className="text-muted text-small">Administrators start new cases for existing clients. Clinicians and clinical leads can add clients.</p>
        </div>
      </div>
    )
  }

  const showContextPicker = (perms.canAddPrivateClient && perms.canAddWorkplaceClient) || myWorkplaces.length > 1
  const workplaceOptions = perms.canAddWorkplaceClient ? myWorkplaces : []

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
          <label>Portfolio context</label>
          {showContextPicker ? (
            <select className="paper-input" value={selectedWorkplaceId} onChange={e => setSelectedWorkplaceId(e.target.value)}>
              {perms.canAddPrivateClient && <option value="private">Private practice</option>}
              {workplaceOptions.map(wp => (
                <option key={wp.id} value={wp.id}>{wp.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-muted">
              {selectedWorkplaceId === 'private' ? 'Private practice' : myWorkplaces.find(w => w.id === selectedWorkplaceId)?.name}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={loading}>{loading ? 'Saving…' : 'Save client'}</button>
        </div>
      </form>
    </div>
  )
}
