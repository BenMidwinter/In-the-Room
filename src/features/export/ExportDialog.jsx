import { useMemo, useState } from 'react'
import FormOverlay from '../../components/FormOverlay'
import { CLIENT_EXPORT_GROUPS, PRACTICE_EXPORT_GROUPS } from '../../lib/exportGroups'
import { requestDataExport } from '../../lib/exportRequest'

export default function ExportDialog({ scope, clientId = null, onClose }) {
  const groups = useMemo(
    () => (scope === 'practice' ? [...CLIENT_EXPORT_GROUPS, ...PRACTICE_EXPORT_GROUPS] : CLIENT_EXPORT_GROUPS),
    [scope],
  )
  const [selected, setSelected] = useState(() => new Set(groups.map((group) => group.id)))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const allSelected = groups.every((group) => selected.has(group.id))

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(groups.map((group) => group.id)))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!selected.size) {
      setError('Choose at least one part of the record.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestDataExport({
        scope,
        clientId,
        include: [...selected],
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export could not be requested.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormOverlay
      title={scope === 'practice' ? 'Export practice' : 'Export client'}
      eyebrow="Emailed to your account"
      onClose={onClose}
      footer={done ? (
        <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
      ) : (
        <button type="submit" form="export-request" className="btn btn-primary" disabled={busy || !selected.size}>
          {busy ? 'Requesting…' : 'Email the export'}
        </button>
      )}
    >
      {done ? (
        <p>
          The export is being prepared. A one-time link will be emailed to your account address.
          This browser does not receive the file. You can see whether it is preparing, emailed, or expired in Settings, under Export.
        </p>
      ) : (
        <form id="export-request" className="settings-form" onSubmit={onSubmit}>
          <p className="settings-form__hint">
            Tick what to include. The zip is built on the server and emailed to the address on this account.
            {scope === 'practice' ? ' Bank and invoice details are included, because they belong to the account.' : ''}
          </p>
          <label className="contact-invoice-flag">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all
          </label>
          {groups.map((group) => (
            <label key={group.id} className="contact-invoice-flag">
              <input
                type="checkbox"
                checked={selected.has(group.id)}
                onChange={() => toggle(group.id)}
              />
              {group.label}
            </label>
          ))}
          {scope === 'practice' && (
            <>
              <label className="settings-form__field">
                From
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                <span className="settings-form__hint">
                  Optional. Limits process notes, appointments, support, invoices, the journal, CPD, and supervision.
                </span>
              </label>
              <label className="settings-form__field">
                To
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </>
          )}
          {error && <p className="auth-page__alert" role="alert">{error}</p>}
        </form>
      )}
    </FormOverlay>
  )
}
