import { useEffect, useMemo, useState } from 'react'
import LetterheadBrandingForm from '../../components/LetterheadBrandingForm'
import { getProfile, updatePrivatePracticeBranding } from '../../lib/store'
import { resolvePracticeBranding } from '../../lib/workplaceBranding'

export default function PrivatePracticeBrandingPanel({ userId }) {
  const [practiceName, setPracticeName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [addressLine3, setAddressLine3] = useState('')
  const [postcode, setPostcode] = useState('')
  const [country, setCountry] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    const profile = getProfile(userId)
    if (!profile) return
    const branding = resolvePracticeBranding(profile)
    setPracticeName(profile.practice_name || '')
    setLogoUrl(profile.practice_logo_url || '')
    setAddressLine1(profile.practice_address_line1 || branding.address_line1)
    setAddressLine2(profile.practice_address_line2 || '')
    setAddressLine3(profile.practice_address_line3 || '')
    setPostcode(profile.practice_postcode || '')
    setCountry(profile.practice_country || branding.country)
  }, [userId])

  const previewBranding = useMemo(() => resolvePracticeBranding({
    full_name: practiceName || getProfile(userId)?.full_name,
    practice_name: practiceName,
    practice_logo_url: logoUrl || null,
    practice_address_line1: addressLine1,
    practice_address_line2: addressLine2,
    practice_address_line3: addressLine3,
    practice_postcode: postcode,
    practice_country: country,
  }), [userId, practiceName, logoUrl, addressLine1, addressLine2, addressLine3, postcode, country])

  const handleSave = async (event) => {
    event.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      updatePrivatePracticeBranding(userId, {
        practice_name: practiceName,
        practice_logo_url: logoUrl,
        practice_address_line1: addressLine1,
        practice_address_line2: addressLine2,
        practice_address_line3: addressLine3,
        practice_postcode: postcode,
        practice_country: country,
      })
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="role-block__panel">
      <LetterheadBrandingForm
        displayName={previewBranding.name}
        logoUrl={logoUrl}
        addressLine1={addressLine1}
        addressLine2={addressLine2}
        addressLine3={addressLine3}
        postcode={postcode}
        country={country}
        onLogoUrlChange={setLogoUrl}
        onAddressLine1Change={setAddressLine1}
        onAddressLine2Change={setAddressLine2}
        onAddressLine3Change={setAddressLine3}
        onPostcodeChange={setPostcode}
        onCountryChange={setCountry}
        previewBranding={previewBranding}
        error={error}
        savedMessage={saved ? 'Private practice letterhead saved.' : ''}
        saving={saving}
        saveLabel="Save letterhead"
        onSubmit={handleSave}
        practiceNameField={(
          <label className="letterhead-branding__field">
            <span className="letterhead-branding__label">Practice name</span>
            <input
              type="text"
              className="paper-input"
              placeholder="Defaults to your full name if left blank"
              value={practiceName}
              onChange={e => setPracticeName(e.target.value)}
            />
          </label>
        )}
      />
    </div>
  )
}
