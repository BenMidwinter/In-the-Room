import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { useToast } from '../../components/ui'
import { confirmCurrentPassword } from '../../lib/auth/confirmPassword'
import { EMPTY_PAYMENT } from '../../lib/invoices'
import { loadPaymentDetails, savePaymentDetails } from '../../lib/supabase/invoicesRepo'

export default function InvoicePaymentSettings({ userId }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <SettingsSectionCard
      blockId="settings_invoice_payment"
      title="Payment details"
      description="Copied onto an invoice when you issue it. Hidden until you enter your password."
    >
      {revealed ? (
        <PaymentDetailsForm userId={userId} onHide={() => setRevealed(false)} />
      ) : (
        <PaymentDetailsLock onUnlock={() => setRevealed(true)} />
      )}
    </SettingsSectionCard>
  )
}

function PaymentDetailsLock({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await confirmCurrentPassword(password)
      setPassword('')
      onUnlock()
    } catch (err) {
      setPassword('')
      setError(err?.message || 'That password does not match.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="payment-lock">
      <div className="payment-lock__mask" aria-hidden="true">
        <LockRow label="Account name" />
        <LockRow label="Sort code" />
        <LockRow label="Account number" />
        <LockRow label="Note" />
      </div>
      <form className="settings-form" onSubmit={onSubmit}>
        <label className="settings-form__field" htmlFor="invoice-payment-password">
          <span>Password</span>
          <input
            id="invoice-payment-password"
            className="paper-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="settings-form__hint">Enter your sign-in password to view or change these details.</p>
        </label>
        {error && <p className="auth-page__alert" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'Show payment details'}
        </button>
      </form>
    </div>
  )
}

function LockRow({ label }) {
  return (
    <div className="payment-lock__row">
      <span>{label}</span>
      <span className="payment-lock__bar" />
    </div>
  )
}

function PaymentDetailsForm({ userId, onHide }) {
  const query = useQuery({
    queryKey: ['invoice-payment', userId],
    queryFn: loadPaymentDetails,
    enabled: Boolean(userId),
  })

  return (
    <>
      <div className="settings-form__actions">
        <button type="button" className="btn btn-secondary" onClick={onHide}>Hide payment details</button>
      </div>
      {query.isPending && <p className="text-muted">Loading payment details…</p>}
      {query.isError && <p className="auth-page__alert" role="alert">{query.error.message}</p>}
      {query.data && (
        <PaymentDetailsFields key={JSON.stringify(query.data)} initial={query.data} userId={userId} />
      )}
    </>
  )
}

function PaymentDetailsFields({ initial, userId }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [accountName, setAccountName] = useState(initial.accountName || '')
  const [sortCode, setSortCode] = useState(initial.sortCode || '')
  const [accountNumber, setAccountNumber] = useState(initial.accountNumber || '')
  const [note, setNote] = useState(initial.note || '')
  const [dueDays, setDueDays] = useState(String(initial.dueDays ?? EMPTY_PAYMENT.dueDays))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(event) {
    event.preventDefault()
    const days = Number(dueDays)
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      setError('Due days should be from 0 to 365.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const details = { accountName, sortCode, accountNumber, note, dueDays: days }
      await savePaymentDetails(details)
      await queryClient.invalidateQueries({ queryKey: ['invoice-payment', userId] })
      toast.saved()
    } catch (err) {
      setError(err?.message || 'Could not save payment details')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      <label className="settings-form__field" htmlFor="invoice-account-name">
        <span>Account name</span>
        <input id="invoice-account-name" className="paper-input" value={accountName} onChange={(event) => setAccountName(event.target.value)} autoComplete="off" />
      </label>
      <label className="settings-form__field" htmlFor="invoice-sort-code">
        <span>Sort code</span>
        <input id="invoice-sort-code" className="paper-input" value={sortCode} onChange={(event) => setSortCode(event.target.value)} placeholder="00-00-00" autoComplete="off" />
      </label>
      <label className="settings-form__field" htmlFor="invoice-account-number">
        <span>Account number</span>
        <input id="invoice-account-number" className="paper-input" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} autoComplete="off" />
      </label>
      <label className="settings-form__field" htmlFor="invoice-payment-note">
        <span>Note</span>
        <input id="invoice-payment-note" className="paper-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Use the invoice number as the reference" />
      </label>
      <label className="settings-form__field" htmlFor="invoice-due-days">
        <span>Due in days</span>
        <input id="invoice-due-days" className="paper-input" type="number" min={0} max={365} value={dueDays} onChange={(event) => setDueDays(event.target.value)} />
      </label>
      {error && <p className="auth-page__alert" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save payment details'}
      </button>
    </form>
  )
}
