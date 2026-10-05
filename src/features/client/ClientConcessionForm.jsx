import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui'
import { feePenceToInput, parseFeePounds } from '../../lib/money'
import { queryKeys } from '../../lib/queries'
import { concessionFromClient } from '../../lib/sessionPrice'
import { saveClientConcession } from '../../lib/supabase/clientsRepo'

export default function ClientConcessionForm({ client, onSaved }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const current = concessionFromClient(client)
  const [kind, setKind] = useState(current.kind)
  const [percent, setPercent] = useState(current.percent ? String(current.percent) : '')
  const [amount, setAmount] = useState(current.amountPence ? feePenceToInput(current.amountPence) : '')
  const [label, setLabel] = useState(current.label)
  const [saving, setSaving] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    let concession = { kind: 'none', percent: null, amountPence: null, label: '' }
    if (kind === 'percent') {
      const value = Math.trunc(Number(percent))
      if (!value || value < 1 || value > 100) {
        toast.error('Enter a percentage from 1 to 100.')
        return
      }
      concession = { kind, percent: value, amountPence: null, label }
    } else if (kind === 'amount') {
      const parsed = parseFeePounds(amount)
      if (parsed.error || !parsed.pence) {
        toast.error(parsed.error || 'Enter an amount off.')
        return
      }
      concession = { kind, percent: null, amountPence: parsed.pence, label }
    }
    setSaving(true)
    try {
      const saved = await saveClientConcession(client.id, concession)
      queryClient.invalidateQueries({ queryKey: queryKeys.clients })
      onSaved?.({
        concession_kind: saved.kind,
        concession_percent: saved.percent,
        concession_pence: saved.amountPence,
        concession_label: saved.label,
      })
      toast.success('Concession saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save the concession')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="client-concession" onSubmit={onSubmit}>
      <label>
        Concession
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="none">None</option>
          <option value="percent">Percentage off</option>
          <option value="amount">Amount off</option>
        </select>
      </label>
      {kind === 'percent' && (
        <label>
          Percent
          <input value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="numeric" placeholder="20" />
        </label>
      )}
      {kind === 'amount' && (
        <label>
          Amount (£)
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="15.00" />
        </label>
      )}
      {kind !== 'none' && (
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Student" maxLength={80} />
        </label>
      )}
      <button type="submit" className="secondary" disabled={saving}>Save concession</button>
    </form>
  )
}
