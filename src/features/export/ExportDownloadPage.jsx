import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'
import { downloadExportFile } from '../../lib/exportRequest'

export default function ExportDownloadPage() {
  const { token } = useParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const onDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadExportFile(token)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This download is no longer available.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <img className="auth-page__logo" src={brandLogoUrl} alt={PRODUCT_NAME} />
        <h1 className="auth-page__title">Download your export</h1>
        <p className="auth-page__lead">
          This is the export you asked for, packed as one zip. Download collects it once, and only within 24 hours of it being ready. Opening this page does not use the link.
        </p>
        {done ? (
          <p className="auth-page__info">The file has been collected. The copy on the server has been removed.</p>
        ) : (
          <button type="button" className="btn btn-primary auth-page__submit" onClick={onDownload} disabled={busy || !token}>
            {busy ? 'Preparing the file…' : 'Download'}
          </button>
        )}
        {error && <p className="auth-page__alert" role="alert">{error}</p>}
      </div>
    </div>
  )
}
