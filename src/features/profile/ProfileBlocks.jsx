import { useState, useEffect } from 'react'
import RoleBlockShell from '../../components/RoleBlockShell'
import { getProfile, updateProfile } from '../../lib/store'
import { profileInitials } from '../../lib/clinicianAvailability'
import PrivatePracticeBrandingPanel from './PrivatePracticeBrandingPanel'
import ProfileAvailabilityPanel from './ProfileAvailabilityPanel'

export function ProfileIdentityBlock({ session, onSaved }) {
  const [fullName, setFullName] = useState('')
  const [hcpcNumber, setHcpcNumber] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [professionalTitle, setProfessionalTitle] = useState('')
  const [signatureText, setSignatureText] = useState('')
  const [signatureImageUrl, setSignatureImageUrl] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!session) return
    const profile = getProfile(session.user.id)
    if (profile) {
      setFullName(profile.full_name || '')
      setHcpcNumber(profile.hcpc_number || '')
      setJobTitle(profile.job_title || '')
      setProfessionalTitle(profile.professional_title || '')
      setSignatureText(profile.signature_text || profile.full_name || '')
      setSignatureImageUrl(profile.signature_image_url || '')
      setBio(profile.bio || '')
      setPhotoUrl(profile.photo_url || '')
    }
  }, [session])

  const handleSave = (e) => {
    e.preventDefault()
    setSaving(true)
    updateProfile(session.user.id, {
      full_name: fullName,
      hcpc_number: hcpcNumber,
      job_title: jobTitle,
      professional_title: professionalTitle.trim(),
      signature_text: signatureText,
      signature_image_url: signatureImageUrl.trim() || null,
      bio: bio.trim(),
      photo_url: photoUrl.trim() || null,
    })
    onSaved?.()
    setSaving(false)
  }

  const initials = profileInitials(fullName)

  return (
    <RoleBlockShell blockId="profile_identity">
      <form onSubmit={handleSave} className="role-block__panel">
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
            <p className="text-small text-muted profile-identity__photo-hint">
              Shown on your clinician profile. Leave blank to use initials.
            </p>
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="profile-hcpc">HCPC number</label>
                <input
                  id="profile-hcpc"
                  className="paper-input"
                  value={hcpcNumber}
                  onChange={e => setHcpcNumber(e.target.value)}
                />
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-job-title">Job title</label>
                <input
                  id="profile-job-title"
                  className="paper-input"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Clinical Lead"
                />
                <p className="text-small text-muted role-block__intro">
                  Your organisational role — how you appear on the team roster.
                </p>
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-professional-title">Professional title</label>
                <input
                  id="profile-professional-title"
                  className="paper-input"
                  value={professionalTitle}
                  onChange={e => setProfessionalTitle(e.target.value)}
                  placeholder="e.g. Music Therapist, Integrative Psychotherapist"
                />
                <p className="text-small text-muted role-block__intro">
                  Your clinical or professional qualifications — shown on signatures and letters.
                </p>
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
                <p className="text-small text-muted role-block__intro">
                  Shown on your clinician profile and letterhead.
                </p>
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-signature-upload">Handwritten signature</label>
                <div className="profile-identity__signature">
                  {signatureImageUrl ? (
                    <img
                      src={signatureImageUrl}
                      alt="Your handwritten signature"
                      className="profile-identity__signature-preview"
                    />
                  ) : (
                    <p className="text-small text-muted profile-identity__signature-empty">
                      No signature uploaded yet.
                    </p>
                  )}
                  <label className="profile-identity__signature-upload">
                    <span className="secondary profile-identity__signature-upload-btn">Upload image</span>
                    <input
                      id="profile-signature-upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file || !file.type.startsWith('image/')) return
                        const reader = new FileReader()
                        reader.onload = () => setSignatureImageUrl(String(reader.result || ''))
                        reader.readAsDataURL(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {signatureImageUrl && (
                    <button
                      type="button"
                      className="text-small profile-identity__signature-remove"
                      onClick={() => setSignatureImageUrl('')}
                    >
                      Remove signature
                    </button>
                  )}
                </div>
                <p className="text-small text-muted role-block__intro">
                  Used when you insert your account signature in progress notes. PNG or JPG recommended.
                </p>
              </div>
              <div className="form-group profile-identity__field--full">
                <label htmlFor="profile-signature">Printed name</label>
                <input
                  id="profile-signature"
                  className="paper-input"
                  value={signatureText}
                  onChange={e => setSignatureText(e.target.value)}
                  placeholder="Printed name for progress notes"
                />
                <p className="text-small text-muted role-block__intro">
                  Fallback sign-off when no handwritten image is stored — also used for the script-font signature option.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </RoleBlockShell>
  )
}

export function ProfileAvailabilityBlock({ userId, onSaved }) {
  return (
    <RoleBlockShell blockId="profile_availability">
      <div className="role-block__panel">
        <ProfileAvailabilityPanel userId={userId} onSaved={onSaved} />
      </div>
    </RoleBlockShell>
  )
}

export function ProfileLetterheadBlock({ userId }) {
  return (
    <RoleBlockShell blockId="profile_letterhead">
      <PrivatePracticeBrandingPanel userId={userId} />
    </RoleBlockShell>
  )
}
