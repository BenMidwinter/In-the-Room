export default function LetterheadPreview({ letterhead }) {
  if (!letterhead) return null
  const practiceName = letterhead.practiceName?.trim() || ''
  const logoUrl = letterhead.logoUrl?.trim() || ''
  const clinicianName = letterhead.clinicianName?.trim() || ''
  const professionalTitle = letterhead.professionalTitle?.trim() || ''
  const lines = (letterhead.addressLines || []).map((line) => String(line || '').trim()).filter(Boolean)
  const hasIdentity = Boolean(logoUrl || clinicianName || professionalTitle)
  const hasPractice = Boolean(practiceName || lines.length)
  if (!hasIdentity && !hasPractice) return null

  return (
    <header className="letterhead-preview">
      <div className="letterhead-preview__brand">
        {hasIdentity && (
          <div className="letterhead-preview__identity">
            {logoUrl && (
              <img className="letterhead-preview__logo" src={logoUrl} alt="" />
            )}
            {clinicianName && <div className="letterhead-preview__clinician">{clinicianName}</div>}
            {professionalTitle && <div className="letterhead-preview__role">{professionalTitle}</div>}
          </div>
        )}
        {hasPractice && (
          <div className="letterhead-preview__practice">
            {practiceName && <div className="letterhead-preview__name">{practiceName}</div>}
            {lines.map((line) => (
              <div key={line} className="letterhead-preview__line">{line}</div>
            ))}
          </div>
        )}
      </div>
      <hr className="letterhead-preview__rule" />
    </header>
  )
}
