import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
    <div className="legal-page">
      <div className="legal-page__bar">
        <Link to="/login" className="legal-page__brand">
          <img src={brandLogoUrl} alt={PRODUCT_NAME} />
        </Link>
      </div>
      <article className="legal-doc">
        <header className="legal-doc__header">
          <h1>Download your export</h1>
        </header>
        <p>
          Opening this page does not use the link. Download collects the file once, and only within 24 hours of it being ready.
        </p>
        {done ? (
          <p>The file has been collected. The copy on the server has been removed.</p>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onDownload} disabled={busy}>
            {busy ? 'Preparing the file…' : 'Download'}
          </button>
        )}
        {error && <p className="auth-page__alert" role="alert">{error}</p>}
      </article>
    </div>
  )
}
