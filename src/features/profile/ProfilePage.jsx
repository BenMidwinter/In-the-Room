import { useState, useEffect } from 'react'
import { useAppSession } from '../../lib/AppSessionContext'
import PageHeader from '../../components/PageHeader'
import { getProfile, updateProfile } from '../../lib/store'

export default function ProfilePage() {
  const { session, refreshClients } = useAppSession()
  const [fullName, setFullName] = useState('')
  const [hcpcNumber, setHcpcNumber] = useState('')
  const [signatureText, setSignatureText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const profile = getProfile(session.user.id)
    if (profile) {
      setFullName(profile.full_name || '')
      setHcpcNumber(profile.hcpc_number || '')
      setSignatureText(profile.signature_text || profile.full_name || '')
    }
  }, [session.user.id])

  const handleSave = (e) => {
    e.preventDefault()
    setSaving(true)
    updateProfile(session.user.id, {
      full_name: fullName,
      hcpc_number: hcpcNumber,
      signature_text: signatureText,
    })
    refreshClients()
    setSaving(false)
  }

  return (
    <div className="page">
      <PageHeader title="Profile" subtitle="Your clinician profile and private practice details." />

      <form onSubmit={handleSave} className="card" style={{ maxWidth: '560px', marginBottom: '1.25rem' }}>
        <h3 className="card__title">Clinician details</h3>
        <div className="form-group">
          <label>Full name</label>
          <input className="paper-input" value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>HCPC number</label>
          <input className="paper-input" value={hcpcNumber} onChange={e => setHcpcNumber(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Signature line</label>
          <input
            className="paper-input"
            value={signatureText}
            onChange={e => setSignatureText(e.target.value)}
            placeholder="Printed name for progress notes"
          />
          <p className="text-small text-muted" style={{ marginTop: '0.35rem' }}>
            Used when you insert a signature in progress notes — typically your printed name or sign-off.
          </p>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </form>
    </div>
  )
}
