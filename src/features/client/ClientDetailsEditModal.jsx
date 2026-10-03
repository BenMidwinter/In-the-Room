import { useState, useEffect } from 'react'
import DiagnosisPicker from '../../components/DiagnosisPicker'
import { updateClientClinicalDetails } from '../../lib/store'
import { useToast } from '../../components/ui'

export default function ClientDetailsEditModal({ client, onClose, onSaved }) {
  const [school, setSchool] = useState(client.school || '')
  const [medication, setMedication] = useState(client.medication || '')
  const [selectedDiagnoses, setSelectedDiagnoses] = useState([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const toast = useToast()

  useEffect(() => {
    setSchool(client.school || '')
    setMedication(client.medication || '')
    setSelectedDiagnoses(
      client.diagnosis
        ? client.diagnosis.split(',').map(s => s.trim()).filter(Boolean)
        : []
    )
  }, [client])

  const handleSubmit = (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const updated = updateClientClinicalDetails(client.id, {
        school: school.trim(),
        medication: medication.trim(),
        diagnosis: selectedDiagnoses.join(', '),
      })
      onSaved?.(updated)
      toast.success('Client details saved.')
      onClose()
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal card client-details-modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="client-details-edit-title">
        <div className="client-details-modal__header">
          <h2 id="client-details-edit-title">Edit client details</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {errors.form && (
            <p className="form-error" role="alert" style={{ marginBottom: '1rem' }}>{errors.form}</p>
          )}
          <div className="form-group">
            <label>School / setting</label>
            <input className="paper-input" value={school} onChange={e => setSchool(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Diagnosis</label>
            <DiagnosisPicker selected={selectedDiagnoses} onChange={setSelectedDiagnoses} />
          </div>
          <div className="form-group">
            <label>Medication</label>
            <textarea
              className="paper-input"
              rows={3}
              value={medication}
              onChange={e => setMedication(e.target.value)}
              placeholder="Current medications, dosages, and prescriber notes…"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
