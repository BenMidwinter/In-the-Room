import { useMemo, useState } from 'react'
import FormOverlay from '../../components/FormOverlay'
import { useToast } from '../../components/ui'
import { formatDisplayDate } from '../../lib/dateArchitecture'
import { formatGbpFromPence } from '../../lib/money'
import {
  filterBatchCandidates,
  lineAmountPence,
  monthPresetRange,
  readyInvoiceGroups,
} from '../../lib/invoices'

const PRESETS = [
  { id: 'last', label: 'Last Month' },
  { id: 'this', label: 'This Month' },
  { id: 'next', label: 'Next Month' },
]

const SESSION_FILTERS = [
  { id: 'held', label: 'Completed / Held only' },
  { id: 'booked', label: 'Booked / Upcoming only' },
  { id: 'all', label: 'All sessions in range' },
]

export default function BatchInvoiceWizard({
  items,
  today,
  onGenerate,
  onClose,
  onReview,
  onDispatch,
}) {
  const toast = useToast()
  const initial = monthPresetRange(today, 'last')
  const [step, setStep] = useState(1)
  const [preset, setPreset] = useState('last')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [sessionStatus, setSessionStatus] = useState('held')
  const [includeActivities, setIncludeActivities] = useState(false)
  const [chosen, setChosen] = useState({})
  const [openKey, setOpenKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState([])

  const review = useMemo(
    () => buildReview(items, { from, to, sessionStatus, includeActivities }),
    [items, from, to, sessionStatus, includeActivities],
  )
  const selectedGroups = review.groups.filter((group) => chosen[group.key])
  const selectedItemCount = selectedGroups.reduce((sum, group) => sum + group.lines.length, 0)
  const selectedTotal = selectedGroups.reduce((sum, group) => sum + groupTotal(group), 0)
  const allChosen = review.groups.length > 0 && selectedGroups.length === review.groups.length

  function applyPreset(nextPreset) {
    const next = monthPresetRange(today, nextPreset)
    setPreset(nextPreset)
    setFrom(next.from)
    setTo(next.to)
  }

  function findItems() {
    if (!from || !to || from > to) {
      toast.error('Choose a from date and a to date.')
      return
    }
    const next = buildReview(items, { from, to, sessionStatus, includeActivities })
    setChosen(Object.fromEntries(next.groups.map((group) => [group.key, true])))
    setOpenKey('')
    setStep(2)
  }

  function toggleGroup(key) {
    setChosen((current) => ({ ...current, [key]: !current[key] }))
  }

  function toggleAll() {
    setChosen(allChosen ? {} : Object.fromEntries(review.groups.map((group) => [group.key, true])))
  }

  async function generate() {
    const ids = new Set(selectedGroups.flatMap((group) => group.lines.map((line) => line.appointmentId)))
    const source = review.ready.filter((item) => ids.has(item.line?.appointmentId))
    setBusy(true)
    try {
      const invoices = await onGenerate(source)
      if (!invoices.length) return
      setCreated(invoices)
      setStep(3)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoices')
    } finally {
      setBusy(false)
    }
  }

  const itemWord = includeActivities ? 'items' : 'sessions'

  return (
    <FormOverlay title="Batch invoice" meta={step < 3 ? `Step ${step} of 3` : 'Drafts ready'} onClose={onClose} size="lg">
      {step === 1 && (
        <div className="invoice-wizard">
          <div className="invoice-wizard__pills" role="group" aria-label="Date range">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={preset === item.id ? 'invoice-wizard__pill invoice-wizard__pill--on' : 'invoice-wizard__pill'}
                aria-pressed={preset === item.id}
                onClick={() => applyPreset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="invoice-wizard__dates">
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(event) => { setFrom(event.target.value); setPreset('custom') }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={to}
                onChange={(event) => { setTo(event.target.value); setPreset('custom') }}
              />
            </label>
          </div>
          <fieldset className="invoice-wizard__choices">
            <legend>Session status</legend>
            {SESSION_FILTERS.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="batch-session-status"
                  checked={sessionStatus === item.id}
                  onChange={() => setSessionStatus(item.id)}
                />
                {item.label}
              </label>
            ))}
          </fieldset>
          <label className="invoice-wizard__toggle">
            <input
              type="checkbox"
              checked={includeActivities}
              onChange={(event) => setIncludeActivities(event.target.checked)}
            />
            Include recorded admin/support time
          </label>
          <div className="invoice-wizard__actions">
            <button type="button" className="primary" onClick={findItems}>Find Billable Items</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="invoice-wizard">
          <label className="invoice-wizard__master">
            <input type="checkbox" checked={allChosen} onChange={toggleAll} disabled={review.groups.length === 0} />
            Select All ({review.groups.length} clients, {review.ready.length} items)
          </label>
          {selectedGroups.length > 0 && (
            <p className="invoice-wizard__banner">
              Ready to generate {selectedGroups.length} invoices for {selectedItemCount} {itemWord} (Total: {formatGbpFromPence(selectedTotal)})
            </p>
          )}
          {review.groups.length === 0 ? (
            <p className="text-muted">Nothing in these dates is ready to invoice.</p>
          ) : (
            <ul className="invoice-wizard__groups">
              {review.groups.map((group) => {
                const open = openKey === group.key
                const title = group.forName && group.forName !== group.billToName
                  ? `${group.billToName} · ${group.forName}`
                  : group.billToName
                return (
                  <li key={group.key}>
                    <div className="invoice-wizard__group-head">
                      <input
                        type="checkbox"
                        checked={Boolean(chosen[group.key])}
                        aria-label={`Select ${title}`}
                        onChange={() => toggleGroup(group.key)}
                      />
                      <button type="button" className="invoice-wizard__group-toggle" aria-expanded={open} onClick={() => setOpenKey(open ? '' : group.key)}>
                        <span>{title}</span>
                        <span>{group.lines.length} items</span>
                        <span>Estimated Total: {formatGbpFromPence(groupTotal(group))}</span>
                      </button>
                    </div>
                    {open && (
                      <table className="invoice-wizard__lines">
                        <tbody>
                          {group.lines.map((line) => {
                            const source = review.ready.find((item) => item.line?.appointmentId === line.appointmentId)
                            return (
                              <tr key={line.appointmentId || line.description}>
                                <td>{line.sessionDate ? formatDisplayDate(line.sessionDate) : '—'}</td>
                                <td>{source?.serviceName || line.description}</td>
                                <td>{source?.priceNote || '—'}</td>
                                <td>{formatGbpFromPence(line.unitPence)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {review.unpriced.length > 0 && (
            <div className="invoice-wizard__alert" role="status">
              <p>{review.unpriced.length} with no price are left out until you set a fee.</p>
              <ul>
                {review.unpriced.map((item) => (
                  <li key={item.appointmentId}>
                    <span aria-hidden>⚠</span>
                    {' '}
                    {item.sessionDate ? formatDisplayDate(item.sessionDate) : '—'}
                    {' '}
                    {item.clientName}
                    {' · '}
                    {item.serviceName}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="invoice-wizard__actions">
            <button type="button" className="secondary" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="primary" disabled={busy || selectedGroups.length === 0} onClick={generate}>
              Generate {selectedGroups.length} Invoices as Drafts
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="invoice-wizard">
          <p className="invoice-wizard__success">Successfully created {created.length} draft invoices.</p>
          <div className="invoice-wizard__actions">
            <button type="button" className="primary" onClick={() => onDispatch(created)}>Dispatch / Send This Batch Now</button>
            <button type="button" className="secondary" onClick={onReview}>Review in Drafts</button>
          </div>
        </div>
      )}
    </FormOverlay>
  )
}

function buildReview(items, range) {
  const filtered = filterBatchCandidates(items, range)
  const groups = readyInvoiceGroups(filtered.ready.map((item) => ({
    clientId: item.clientId,
    clientName: item.clientName,
    billToName: item.billToName,
    billToEmail: item.billToEmail,
    billedToContact: item.billedToContact,
    marked: Boolean(item.held),
    pricedActivity: Boolean(item.pricedActivity),
    line: item.line,
  })), { includeUnheld: true })
  return { ready: filtered.ready, unpriced: filtered.unpriced, groups }
}

function groupTotal(group) {
  return group.lines.reduce((sum, line) => sum + lineAmountPence(line), 0)
}
