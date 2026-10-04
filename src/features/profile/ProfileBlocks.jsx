import { useState, useEffect } from 'react'
import SectionCard from '../../components/SectionCard'
import { getProfile, updateProfile } from '../../lib/store'
import { profileInitials } from '../../lib/clinicianAvailability'
import ProfileAvailabilityPanel from './ProfileAvailabilityPanel'
import LetterheadsPanel from './LetterheadsPanel'
import { getSupabase } from '../../lib/supabase/client'
import { useToast } from '../../components/ui'

const EMPTY_REGISTRATION = { body: '', number: '' }

function normalizeRegistrations(profile) {
  if (Array.isArray(profile?.registration_numbers) && profile.registration_numbers.length) {
    return profile.registration_numbers.map((row) => ({
      body: row.body || '',
      number: row.number || '',
    }))
  }
  if (profile?.hcpc_number || profile?.registration_number) {
    return [{
      body: profile.hcpc_number ? 'HCPC' : '',
      number: profile.hcpc_number || profile.registration_number || '',
    }]
  }
  return [{ ...EMPTY_REGISTRATION }]
}

export function ProfileIdentityBlock({ session, onSaved }) {
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [registrations, setRegistrations] = useState([{ ...EMPTY_REGISTRATION }])
  const [professionalTitle, setProfessionalTitle] = useState('')
  const [signatureText, setSignatureText] = useState('')
  const [signatureImageUrl, setSignatureImageUrl] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      const local = getProfile(session.user.id)
      const supabase = getSupabase()
      let remote = null
      if (supabase) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
        remote = data
      }
      if (cancelled) return
      const profile = remote || local
      if (!profile) return
      setFullName(profile.full_name || profile.display_name || '')
      setRegistrations(normalizeRegistrations(profile))
      setProfessionalTitle(profile.professional_title || '')
      setSignatureText(profile.signature_text || profile.full_name || profile.display_name || '')
      setSignatureImageUrl(profile.signature_image_url || '')
      setBio(profile.bio || '')
      setPhotoUrl(profile.photo_url || '')
    }

    load()
    return () => { cancelled = true }
  }, [session])

  const updateRegistration = (index, patch) => {
    setRegistrations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addRegistration = () => {
    setRegistrations((rows) => [...rows, { ...EMPTY_REGISTRATION }])
  }

  const removeRegistration = (index) => {
    setRegistrations((rows) => (rows.length <= 1 ? [{ ...EMPTY_REGISTRATION }] : rows.filter((_, i) => i !== index)))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const cleaned = registrations
      .map((row) => ({ body: row.body.trim(), number: row.number.trim() }))
      .filter((row) => row.body || row.number)

    const updates = {
      full_name: fullName,
      display_name: fullName,
      registration_numbers: cleaned,
      registration_number: cleaned[0]?.number || '',
      hcpc_number: cleaned.find((r) => r.body.toUpperCase() === 'HCPC')?.number || '',
      professional_title: professionalTitle.trim(),
      signature_text: signatureText,
      signature_image_url: signatureImageUrl.trim() || null,
      bio: bio.trim(),
      photo_url: photoUrl.trim() || null,
    }

    try {
      updateProfile(session.user.id, updates)
      const supabase = getSupabase()
      if (supabase) {
        const { error: saveError } = await supabase.from('profiles').upsert({
          id: session.user.id,
          display_name: fullName,
          email: session.user.email || null,
          professional_title: professionalTitle.trim() || null,
          registration_number: cleaned[0]?.number || null,
          registration_numbers: cleaned,
          bio: bio.trim() || null,
          photo_url: photoUrl.trim() || null,
        })
        if (saveError) throw saveError
      }
      toast.saved()
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  const initials = profileInitials(fullName)

  return (
    <SectionCard blockId="profile_identity" title="Account details">
      <form onSubmit={handleSave} className="section-card__panel">
        <div className="profile-identity__layout">
          <div className="profile-identity__photo">
            <div className="profile-identity__photo-frame" aria-hidden={!photoUrl}>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="profile-identity__photo-image" />
              ) : (
                <span className="profile-identity__initials">{initials}</span>
              )}
            </div>
            <label className="profile-identity__photo-field" htmlFor="profile-photo-url">
              <span className="profile-identity__photo-label">Profile photo URL</span>
              <input
                id="profile-photo-url"
                type="url"
                className="paper-input"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Paste an image link"
              />
            </label>
          </div>

          <div className="profile-identity__fields">
            <div className="profile-identity__grid">
              <div className="form-group">
                <label htmlFor="profile-full-name">Full name</label>
                <input
                  id="profile-full-name"
                  className="paper-input"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-professional-title">Professional title</label>
                <input
                  id="profile-professional-title"
                  className="paper-input"
                  value={professionalTitle}
                  onChange={e => setProfessionalTitle(e.target.value)}
                  placeholder="e.g. Integrative Psychotherapist"
                />
              </div>

              <div className="form-group profile-identity__field--full">
                <span className="profile-identity__photo-label">Registration numbers</span>
                <p className="text-small text-muted section-card__intro" style={{ marginTop: '0.35rem' }}>
                  Add each register you hold (HCPC, BACP, UKCP, NMC, etc.) with its number.
                </p>
                <div className="registration-list">
                  {registrations.map((row, index) => (
                    <div key={`reg-${index}`} className="registration-list__row">
                      <input
                        className="paper-input"
                        placeholder="Body (e.g. HCPC)"
                        value={row.body}
                        onChange={(e) => updateRegistration(index, { body: e.target.value })}
                        aria-label={`Registration body ${index + 1}`}
                      />
                      <input
                        className="paper-input"
                        placeholder="Registration number"
                        value={row.number}
                        onChange={(e) => updateRegistration(index, { number: e.target.value })}
                        aria-label={`Registration number ${index + 1}`}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => removeRegistration(index)}
                        aria-label={`Remove registration ${index + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary" onClick={addRegistration} style={{ marginTop: '0.5rem' }}>
                  Add registration
                </button>
              </div>

              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-bio">Biography</label>
                <textarea
                  id="profile-bio"
                  className="paper-input profile-panel__bio"
                  rows={4}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="A short professional biography — your approach, settings, and interests."
                />
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-signature">Printed name</label>
                <input
                  id="profile-signature"
                  className="paper-input"
                  value={signatureText}
                  onChange={e => setSignatureText(e.target.value)}
                  placeholder="Printed name for Process Notes"
                />
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-signature-image">Signature image URL</label>
                <input
                  id="profile-signature-image"
                  type="url"
                  className="paper-input"
                  value={signatureImageUrl}
                  onChange={e => setSignatureImageUrl(e.target.value)}
                  placeholder="Optional handwritten signature image"
                />
              </div>
            </div>
          </div>
        </div>
        {error && <p className="auth-page__alert" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}

export function ProfileAvailabilityBlock({ userId, onSaved }) {
  return (
    <SectionCard blockId="profile_availability" title="Availability & services">
      <div className="section-card__panel">
        <ProfileAvailabilityPanel userId={userId} onSaved={onSaved} />
      </div>
    </SectionCard>
  )
}

export function ProfileLetterheadBlock() {
  return <LetterheadsPanel />
}
