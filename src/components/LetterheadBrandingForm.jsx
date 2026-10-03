import { formatWorkplaceAddress } from '../lib/workplaceBranding'

export default function LetterheadBrandingForm({
  displayName,
  logoUrl,
  addressLine1,
  addressLine2,
  addressLine3,
  postcode,
  country,
  onLogoUrlChange,
  onAddressLine1Change,
  onAddressLine2Change,
  onAddressLine3Change,
  onPostcodeChange,
  onCountryChange,
  previewBranding,
  error,
  savedMessage,
  saving,
  saveLabel = 'Save',
  onSubmit,
  practiceNameField,
}) {
  return (
    <div className="letterhead-branding">
      <div className="letterhead-branding__preview" aria-label="Letterhead preview">
        {previewBranding.logo_url ? (
          <img
            className="letterhead-branding__logo"
            src={previewBranding.logo_url}
            alt={`${displayName} logo`}
          />
        ) : (
          <div className="letterhead-branding__logo letterhead-branding__logo--empty" aria-hidden>
            No logo
          </div>
        )}
        <div className="letterhead-branding__preview-text">
          <strong>{previewBranding.name}</strong>
          <span>{formatWorkplaceAddress(previewBranding) || 'Add your practice address below'}</span>
        </div>
      </div>

      <form className="letterhead-branding__form" onSubmit={onSubmit}>
        {practiceNameField && (
          <div className="letterhead-branding__field letterhead-branding__field--full">
            {practiceNameField}
          </div>
        )}

        <label className="letterhead-branding__field letterhead-branding__field--full">
          <span className="letterhead-branding__label">Logo URL</span>
          <input
            type="url"
            className="paper-input"
            placeholder="Leave blank to use your practice name"
            value={logoUrl}
            onChange={e => onLogoUrlChange(e.target.value)}
          />
        </label>

        <div className="letterhead-branding__address-grid">
          <label className="letterhead-branding__field letterhead-branding__field--span-2">
            <span className="letterhead-branding__label">Address line 1</span>
            <input
              type="text"
              className="paper-input"
              value={addressLine1}
              onChange={e => onAddressLine1Change(e.target.value)}
            />
          </label>

          <label className="letterhead-branding__field">
            <span className="letterhead-branding__label">Address line 2</span>
            <input
              type="text"
              className="paper-input"
              value={addressLine2}
              onChange={e => onAddressLine2Change(e.target.value)}
            />
          </label>

          <label className="letterhead-branding__field">
            <span className="letterhead-branding__label">Town / city</span>
            <input
              type="text"
              className="paper-input"
              value={addressLine3}
              onChange={e => onAddressLine3Change(e.target.value)}
            />
          </label>

          <label className="letterhead-branding__field">
            <span className="letterhead-branding__label">Postcode</span>
            <input
              type="text"
              className="paper-input"
              value={postcode}
              onChange={e => onPostcodeChange(e.target.value)}
            />
          </label>

          <label className="letterhead-branding__field">
            <span className="letterhead-branding__label">Country</span>
            <input
              type="text"
              className="paper-input"
              value={country}
              onChange={e => onCountryChange(e.target.value)}
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        {savedMessage && <p className="text-small text-muted">{savedMessage}</p>}

        <div className="letterhead-branding__actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
