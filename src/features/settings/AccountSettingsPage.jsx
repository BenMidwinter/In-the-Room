import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ProfileIdentityBlock,
  ProfileLetterheadBlock,
} from '../profile/ProfileBlocks'
import { useAppSession } from '../../lib/AppSessionContext'
import { SettingsSectionCard } from './SettingsPlaceholders'
import LoginSettingsPage from './LoginSettingsPage'
import InvoicePaymentSettings from './InvoicePaymentSettings'
import { useToast } from '../../components/ui'
import {
  loadCancellationPolicy,
  saveCancellationPolicy,
} from '../../lib/supabase/cancellationPolicyRepo'

const FEE_OPTIONS = [
  { value: 'full', label: 'Full fee' },
  { value: 'half', label: 'Half fee' },
  { value: 'none', label: 'No fee' },
]

export default function AccountSettingsPage() {
  const { session, refreshClients } = useAppSession()

  if (!session) {
    return <p className="text-muted">Sign in to edit account settings.</p>
  }

  return (
    <div className="section-card-stack">
      <ProfileIdentityBlock session={session} onSaved={refreshClients} />
      <ProfileLetterheadBlock />
      <LoginSettingsPage />
      <CancellationPolicyCard userId={session.user.id} />
      <InvoicePaymentSettings userId={session.user.id} />
      <SettingsSectionCard
        blockId="settings_subscription"
        title="Subscription"
      >
        <p className="text-muted" style={{ marginTop: 0 }}>
          Subscription is not available yet. When it is, your plan will show here, and you will be able to cancel it.
        </p>
      </SettingsSectionCard>
    </div>
  )
}

function CancellationPolicyCard({ userId }) {
  const query = useQuery({
    queryKey: ['cancellation-policy', userId],
    queryFn: loadCancellationPolicy,
    enabled: Boolean(userId),
  })

  return (
    <SettingsSectionCard
      blockId="settings_cancellation"
      title="Cancellation policy"
      description="Sets the fee when a session is cancelled or marked did not attend."
    >
      {query.isPending && <p className="text-muted">Loading the cancellation policy…</p>}
      {query.isError && <p className="auth-page__alert" role="alert">{query.error.message}</p>}
      {query.data && (
        <CancellationPolicyForm key={JSON.stringify(query.data)} initial={query.data} userId={userId} />
      )}
    </SettingsSectionCard>
  )
}

function CancellationPolicyForm({ initial, userId }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [policy, setPolicy] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveCancellationPolicy(policy)
      await queryClient.invalidateQueries({ queryKey: ['cancellation-policy', userId] })
      toast.saved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="settings-form" onSubmit={save}>
      <label className="settings-form__field">
        <span>Notice (hours)</span>
        <input
          className="paper-input"
          type="number"
          min={0}
          max={720}
          value={policy.noticeHours}
          onChange={(event) => setPolicy((current) => ({
            ...current,
            noticeHours: event.target.value,
          }))}
          required
        />
        <p className="settings-form__hint">
          A cancellation inside this many hours uses the late fee. Earlier than that uses the early fee.
        </p>
      </label>
      <FeeSelect
        id="cancel-late-fee"
        label="Cancelled inside the notice"
        value={policy.lateFee}
        onChange={(lateFee) => setPolicy((current) => ({ ...current, lateFee }))}
      />
      <FeeSelect
        id="cancel-early-fee"
        label="Cancelled earlier"
        value={policy.earlyFee}
        onChange={(earlyFee) => setPolicy((current) => ({ ...current, earlyFee }))}
      />
      <FeeSelect
        id="dna-fee"
        label="Did not attend"
        value={policy.dnaFee}
        onChange={(dnaFee) => setPolicy((current) => ({ ...current, dnaFee }))}
      />
      <p className="settings-form__hint">
        Marking a session cancelled or did not attend uses this policy. Do not invoice on the session overrides it.
      </p>
      {error && <p className="auth-page__alert" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save cancellation policy'}
      </button>
    </form>
  )
}

function FeeSelect({ id, label, value, onChange }) {
  return (
    <label className="settings-form__field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        className="paper-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {FEE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}
