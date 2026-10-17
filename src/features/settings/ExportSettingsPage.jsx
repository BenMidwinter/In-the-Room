import { useCallback, useEffect, useState } from 'react'
import ExportDialog from '../export/ExportDialog'
import { listDataExports } from '../../lib/exportRequest'
import { SettingsSectionCard } from './SettingsPlaceholders'

const STATUS_LABEL = {
  preparing: 'Preparing',
  emailed: 'Emailed',
  expired: 'Expired',
  failed: 'Could not be prepared',
}

function when(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ExportSettingsPage() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await listDataExports()
      setRows(data?.exports || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exports could not be loaded.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!rows.some((row) => row.status === 'preparing')) return undefined
    const timer = window.setInterval(load, 8000)
    return () => window.clearInterval(timer)
  }, [rows, load])

  return (
    <div className="section-card-stack">
      <SettingsSectionCard
        blockId="settings_export"
        title="Export"
        description="A whole-practice zip is emailed to your account address. This page does not offer the file."
        actions={(
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            New export
          </button>
        )}
      >
        <p className="text-muted" style={{ marginTop: 0 }}>
          Status is preparing, emailed, or expired. A stolen sign-in can ask for an export, and still cannot collect the zip without the account inbox.
        </p>
        {error && <p className="auth-page__alert" role="alert">{error}</p>}
        {rows.length === 0 ? (
          <p className="text-muted">No exports yet.</p>
        ) : (
          <ul className="export-status">
            {rows.map((row) => (
              <li key={row.id}>
                <strong>{row.scope === 'practice' ? 'Whole practice' : 'One client'}</strong>
                {' · '}
                {STATUS_LABEL[row.status] || row.status}
                {' · '}
                {when(row.created_at)}
                {row.status === 'failed' && row.error_message ? ` · ${row.error_message}` : ''}
              </li>
            ))}
          </ul>
        )}
      </SettingsSectionCard>
      {open && (
        <ExportDialog
          scope="practice"
          onClose={() => {
            setOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}
