import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import FormOverlay from '../../components/FormOverlay'
import { useToast } from '../../components/ui'
import { formatGbpFromPence } from '../../lib/money'
import { invoiceBalancePence, paymentInstructions } from '../../lib/invoices'
import { loadPaymentDetails } from '../../lib/supabase/invoicesRepo'
import { emailDeliveryAvailable, sendInvoiceBatch } from '../../lib/invoiceDelivery'

export default function BulkDispatchModal({
  invoices,
  preferManual = false,
  onClose,
  onFinished,
}) {
  const toast = useToast()
  const emailQuery = useQuery({
    queryKey: ['invoice-email-delivery'],
    queryFn: emailDeliveryAvailable,
    retry: false,
    staleTime: 30_000,
  })
  const emailAvailable = Boolean(emailQuery.data)
  const [modeChoice, setModeChoice] = useState(null)
  const [excludeMissing, setExcludeMissing] = useState(true)
  const [note, setNote] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const mode = !emailAvailable ? 'manual' : (modeChoice || (preferManual ? 'manual' : 'email'))
  const missing = invoices.filter((invoice) => !String(invoice.billToEmail || '').trim())
  const missingNames = [...new Set(missing.map((invoice) => invoice.billToName || invoice.forName || 'Client'))]
  const targets = mode === 'email' && excludeMissing
    ? invoices.filter((invoice) => String(invoice.billToEmail || '').trim())
    : invoices
  const totalDue = targets.reduce((sum, invoice) => sum + invoiceBalancePence(invoice), 0)
  const countLabel = targets.length === 1 ? '1 invoice' : `${targets.length} invoices`

  async function send() {
    if (!targets.length || running) return
    const details = await loadPaymentDetails()
    if (!paymentInstructions(details).trim()) {
      toast.error('Add payment details in Account settings before you send these.')
      return
    }
    setRunning(true)
    setProgress({ done: 0, total: targets.length })
    try {
      const next = await sendInvoiceBatch({
        invoiceIds: targets.map((invoice) => invoice.id),
        deliveryMethod: mode === 'email' ? 'email' : 'manual_mark_sent',
        customNote: note.trim(),
      }, {
        invoices: targets,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(next)
      onFinished(next)
    } catch (err) {
      toast.error(err?.message || 'Could not send these invoices')
    } finally {
      setRunning(false)
    }
  }

  return (
    <FormOverlay title="Send invoices" meta={countLabel} onClose={onClose} size="md">
      <div className="invoice-dispatch">
        <p className="invoice-dispatch__summary">
          {targets.length} invoices · {formatGbpFromPence(totalDue)} due
        </p>
        <ul className="invoice-dispatch__clients">
          {targets.map((invoice) => (
            <li key={invoice.id}>
              {invoice.billToName}
              {invoice.forName && invoice.forName !== invoice.billToName ? ` · ${invoice.forName}` : ''}
              {' · '}
              {invoice.number}
            </li>
          ))}
        </ul>

        {missingNames.length > 0 && (
          <div className="invoice-wizard__alert" role="status">
            <p>⚠ {missingNames.length} {missingNames.length === 1 ? 'client does' : 'clients do'} not have an email address.</p>
            {mode === 'email' && (
              <label className="invoice-wizard__toggle">
                <input
                  type="checkbox"
                  checked={excludeMissing}
                  onChange={(event) => setExcludeMissing(event.target.checked)}
                />
                Leave them out of this email so you can print those invoices
              </label>
            )}
          </div>
        )}

        {emailAvailable ? (
          <fieldset className="invoice-wizard__choices">
            <legend>Delivery</legend>
            <label>
              <input type="radio" name="invoice-delivery-mode" checked={mode === 'email'} onChange={() => setModeChoice('email')} />
              Send via Email (Resend)
            </label>
            <label>
              <input type="radio" name="invoice-delivery-mode" checked={mode === 'manual'} onChange={() => setModeChoice('manual')} />
              Mark as Sent Manually
            </label>
          </fieldset>
        ) : (
          <p className="invoice-dispatch__manual">Manual Dispatch (Email integration coming soon)</p>
        )}

        {mode === 'email' && (
          <label className="invoice-dispatch__note">
            Note on the email
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </label>
        )}

        {progress && running && (
          <p className="invoice-dispatch__progress" role="status">
            Sending {Math.min(progress.total, Math.max(progress.done, 1))} of {progress.total}...
          </p>
        )}

        {result && (
          <div className="invoice-dispatch__result" role="status">
            <p>{result.successfulIds.length} now awaiting payment.</p>
            {result.failed.length > 0 && (
              <ul>
                {result.failed.map((item) => (
                  <li key={item.id}>{item.clientName}: {item.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="invoice-wizard__actions">
          {result ? (
            <button type="button" className="primary" onClick={onClose}>Done</button>
          ) : (
            <button type="button" className="primary" disabled={running || targets.length === 0} onClick={send}>
              {mode === 'email'
                ? `Send ${targets.length} Invoices via Email`
                : `Mark ${targets.length} Invoices as Sent`}
            </button>
          )}
        </div>
      </div>
    </FormOverlay>
  )
}
