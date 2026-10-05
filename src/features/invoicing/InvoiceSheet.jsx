import { useEffect, useRef, useState } from 'react'
import LetterheadPreview from '../client/LetterheadPreview'
import FormOverlay from '../../components/FormOverlay'
import { useToast } from '../../components/ui'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import { feePenceToInput, formatGbpFromPence, parseFeePounds } from '../../lib/money'
import {
  invoiceBalancePence,
  invoiceDisplayStatus,
  lineAmountPence,
  paidPence,
} from '../../lib/invoices'

const STATUS_LABEL = {
  draft: 'Draft',
  awaiting: 'Sent',
  partial: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

export default function InvoiceSheet({
  invoice,
  today,
  letterhead,
  paymentText,
  items,
  onBack,
  onStatus,
  onDelete,
  onSaveRecipient,
  onSaveLine,
  onAddLine,
  onRemoveLine,
  onRecordPayment,
  onRemovePayment,
}) {
  const display = invoiceDisplayStatus(invoice, today)
  const draft = invoice.status === 'draft'
  const balance = invoiceBalancePence(invoice)
  const paid = paidPence(invoice.payments)
  const [editingId, setEditingId] = useState(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [recipientOpen, setRecipientOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const showFor = invoice.forName && invoice.forName !== invoice.billToName
  const anyVat = invoice.lines.some((line) => line.includesVat)

  return (
    <div className="invoice-workspace">
      <header className="invoice-bar invoicing-no-print">
        <button type="button" className="invoice-bar__back" onClick={onBack}>← Invoices</button>
        <span className={statusClass(display)}>{STATUS_LABEL[display] || display}</span>
        <div className="invoice-bar__actions">
          <button type="button" className="secondary" onClick={() => window.print()}>Preview / PDF</button>
          {draft && (
            <button type="button" className="primary" onClick={() => onStatus('issued')}>Send Invoice</button>
          )}
          <OverflowMenu>
            {draft && <button type="button" onClick={onDelete}>Delete</button>}
            {invoice.status !== 'void' && invoice.status !== 'draft' && (
              <button type="button" onClick={() => onStatus('void')}>Void</button>
            )}
            {invoice.status === 'issued' && balance > 0 && (
              <button type="button" onClick={() => setPaymentOpen(true)}>Record payment</button>
            )}
          </OverflowMenu>
        </div>
      </header>

      <article className="invoice-sheet">
        <LetterheadPreview letterhead={letterhead} />
        <div className="invoice-parties">
          <div>
            <p className="invoice-kicker">Billed to</p>
            <p className="invoice-parties__name">{invoice.billToName}</p>
            {invoice.billToEmail ? <p className="invoice-parties__email">{invoice.billToEmail}</p> : null}
            {showFor ? <p className="invoice-parties__for">For {invoice.forName}</p> : null}
            {draft && (
              <button type="button" className="invoice-text-button invoicing-no-print" onClick={() => setRecipientOpen(true)}>
                Edit recipient
              </button>
            )}
          </div>
          <dl className="invoice-details">
            <div>
              <dt>Invoice</dt>
              <dd>{invoice.number}</dd>
            </div>
            <div>
              <dt>Issue date</dt>
              <dd>{invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : '—'}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{invoice.dueOn ? formatDisplayDate(invoice.dueOn) : '—'}</dd>
            </div>
          </dl>
        </div>

        <table className="invoice-lines">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
              {draft && <th className="invoicing-no-print"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 && !customOpen ? (
              <tr>
                <td colSpan={draft ? 6 : 5} className="invoice-lines__empty">No lines yet.</td>
              </tr>
            ) : invoice.lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                draft={draft}
                editing={editingId === line.id}
                onEdit={() => setEditingId(line.id)}
                onDone={() => setEditingId(null)}
                onSave={onSaveLine}
                onRemove={onRemoveLine}
              />
            ))}
            {customOpen && (
              <CustomLineRow
                onAdd={onAddLine}
                onCancel={() => setCustomOpen(false)}
              />
            )}
          </tbody>
        </table>

        {draft && (
          <div className="invoice-add invoicing-no-print">
            <button type="button" className="secondary" onClick={() => setPickerOpen(true)}>+ Add unbilled session / activity</button>
            <button type="button" className="secondary" onClick={() => setCustomOpen(true)} disabled={customOpen}>+ Add custom line</button>
          </div>
        )}

        <div className="invoice-totals">
          <div>
            <span>Subtotal</span>
            <span>{formatGbpFromPence(invoice.totalPence)}</span>
          </div>
          {paid > 0 && (
            <div>
              <span>Paid</span>
              <span>{formatGbpFromPence(paid)}</span>
            </div>
          )}
          <div className="invoice-totals__due">
            <span>{draft || balance === invoice.totalPence ? 'Total due' : 'Balance due'}</span>
            <span>{formatGbpFromPence(draft ? invoice.totalPence : balance)}</span>
          </div>
          {anyVat ? <p className="invoice-totals__note">VAT is included in the marked lines.</p> : null}
        </div>

        {invoice.payments.length > 0 && (
          <ul className="invoice-sheet__payments">
            {invoice.payments.map((payment) => (
              <li key={payment.id}>
                <span>{formatDisplayDate(payment.paidOn)} · {formatGbpFromPence(payment.amountPence)}{payment.note ? ` · ${payment.note}` : ''}</span>
                {onRemovePayment && invoice.status !== 'void' ? (
                  <button type="button" className="invoice-text-button invoicing-no-print" onClick={() => onRemovePayment(payment.id)}>Remove</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {paymentText ? (
          <footer className="invoice-sheet__pay">
            <h3>Payment terms</h3>
            {paymentText.split('\n').map((line) => <p key={line}>{line}</p>)}
          </footer>
        ) : null}
      </article>

      {recipientOpen && (
        <RecipientDialog
          invoice={invoice}
          onClose={() => setRecipientOpen(false)}
          onSave={async (input) => {
            await onSaveRecipient(input)
            setRecipientOpen(false)
          }}
        />
      )}
      {pickerOpen && (
        <UnbilledPicker
          invoice={invoice}
          items={items}
          onClose={() => setPickerOpen(false)}
          onAddLine={onAddLine}
        />
      )}
      {paymentOpen && (
        <PaymentDialog
          balance={balance}
          onClose={() => setPaymentOpen(false)}
          onRecord={async (input) => {
            const ok = await onRecordPayment(input)
            if (ok) setPaymentOpen(false)
          }}
        />
      )}
    </div>
  )
}

function statusClass(display) {
  if (display === 'paid') return 'badge badge-green'
  if (display === 'overdue') return 'badge badge-grey'
  if (display === 'draft') return 'badge badge-blue'
  return 'badge badge-blue'
}

function LineRow({ line, draft, editing, onEdit, onDone, onSave, onRemove }) {
  const toast = useToast()
  const [description, setDescription] = useState(line.description)
  const [quantity, setQuantity] = useState(String(line.quantity || 1))
  const [amount, setAmount] = useState(feePenceToInput(line.unitPence))
  const [sessionDate, setSessionDate] = useState(line.sessionDate || '')
  const [includesVat, setIncludesVat] = useState(Boolean(line.includesVat))

  async function commit() {
    const parsed = parseFeePounds(amount)
    if (parsed.error || parsed.pence == null) {
      toast.error(parsed.error || 'Enter a unit price.')
      return
    }
    const qty = Math.trunc(Number(quantity))
    if (!qty || qty < 1) {
      toast.error('Enter a quantity of at least 1.')
      return
    }
    if (!description.trim()) {
      toast.error('Enter a description.')
      return
    }
    await onSave(line.id, {
      appointmentId: line.appointmentId,
      description,
      sessionDate: sessionDate || null,
      unitPence: parsed.pence,
      quantity: qty,
      includesVat,
    })
    onDone()
  }

  if (!draft || !editing) {
    return (
      <tr onClick={draft ? onEdit : undefined} className={draft ? 'invoice-lines__editable' : undefined}>
        <td>{line.sessionDate ? formatDisplayDate(line.sessionDate) : '—'}</td>
        <td>
          {line.description}
          {line.includesVat ? <span className="invoice-lines__meta">Includes VAT</span> : null}
        </td>
        <td>{line.quantity}</td>
        <td>{formatGbpFromPence(line.unitPence)}</td>
        <td>{formatGbpFromPence(lineAmountPence(line))}</td>
        {draft && (
          <td className="invoicing-no-print">
            <button type="button" className="invoice-icon-button" aria-label="Remove line" onClick={(event) => { event.stopPropagation(); onRemove(line.id) }}>
              <TrashIcon />
            </button>
          </td>
        )}
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} aria-label="Date" />
      </td>
      <td>
        <input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Description" />
        <label className="invoice-lines__vat">
          <input type="checkbox" checked={includesVat} onChange={(event) => setIncludesVat(event.target.checked)} />
          Includes VAT
        </label>
      </td>
      <td>
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" aria-label="Quantity" />
      </td>
      <td>
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Unit price" />
      </td>
      <td>{formatGbpFromPence((parseFeePounds(amount).pence || 0) * (Math.trunc(Number(quantity)) || 0))}</td>
      <td className="invoicing-no-print invoice-lines__actions">
        <button type="button" className="secondary" onClick={commit}>Save</button>
        <button type="button" className="invoice-icon-button" aria-label="Remove line" onClick={() => onRemove(line.id)}>
          <TrashIcon />
        </button>
      </td>
    </tr>
  )
}

function CustomLineRow({ onAdd, onCancel }) {
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('')
  const [sessionDate, setSessionDate] = useState(todayYmd())
  const [includesVat, setIncludesVat] = useState(false)

  async function commit() {
    const parsed = parseFeePounds(amount)
    if (parsed.error || parsed.pence == null) {
      toast.error(parsed.error || 'Enter a unit price.')
      return
    }
    const qty = Math.trunc(Number(quantity))
    if (!qty || qty < 1) {
      toast.error('Enter a quantity of at least 1.')
      return
    }
    if (!description.trim()) {
      toast.error('Enter a description.')
      return
    }
    const saved = await onAdd({
      appointmentId: null,
      description,
      sessionDate: sessionDate || null,
      unitPence: parsed.pence,
      quantity: qty,
      includesVat,
    })
    if (saved) onCancel()
  }

  return (
    <tr>
      <td><input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} aria-label="Date" /></td>
      <td>
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" aria-label="Description" />
        <label className="invoice-lines__vat">
          <input type="checkbox" checked={includesVat} onChange={(event) => setIncludesVat(event.target.checked)} />
          Includes VAT
        </label>
      </td>
      <td><input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" aria-label="Quantity" /></td>
      <td><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Unit price" /></td>
      <td />
      <td className="invoicing-no-print invoice-lines__actions">
        <button type="button" className="secondary" onClick={commit}>Add</button>
        <button type="button" className="invoice-icon-button" aria-label="Cancel line" onClick={onCancel}>×</button>
      </td>
    </tr>
  )
}

function UnbilledPicker({ invoice, items, onClose, onAddLine }) {
  const [picked, setPicked] = useState({})
  const [query, setQuery] = useState('')
  const rows = (items || []).filter((item) => {
    if (item.doNotInvoice || !item.hasFee || !item.line) return false
    if (invoice.clientId && item.clientId && item.clientId !== invoice.clientId) return false
    const hay = `${item.clientName} ${item.serviceName} ${item.line.description}`.toLowerCase()
    return !query.trim() || hay.includes(query.trim().toLowerCase())
  })
  const chosen = rows.filter((row) => picked[row.appointmentId])

  async function addSelected() {
    for (const row of chosen) {
      const ok = await onAddLine(row.line)
      if (!ok) return
    }
    onClose()
  }

  return (
    <FormOverlay
      title="Add unbilled session / activity"
      eyebrow={invoice.billToName}
      onClose={onClose}
      size="lg"
      footer={(
        <button type="button" className="primary" disabled={chosen.length === 0} onClick={addSelected}>
          Add selected
        </button>
      )}
    >
      <label className="invoice-picker__find">
        Find
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client or service" />
      </label>
      {rows.length === 0 ? <p className="text-muted">Nothing unbilled for this invoice.</p> : (
        <ul className="invoice-picker__list">
          {rows.map((row) => (
            <li key={row.appointmentId}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(picked[row.appointmentId])}
                  onChange={() => setPicked((current) => ({ ...current, [row.appointmentId]: !current[row.appointmentId] }))}
                />
                <span>
                  {formatDisplayDate(row.sessionDate)} · {row.clientName} · {row.serviceName || row.line.description}
                </span>
              </label>
              <span>{formatGbpFromPence(row.line.unitPence)}</span>
            </li>
          ))}
        </ul>
      )}
    </FormOverlay>
  )
}

function RecipientDialog({ invoice, onClose, onSave }) {
  const [name, setName] = useState(invoice.billToName)
  const [email, setEmail] = useState(invoice.billToEmail)
  return (
    <FormOverlay
      title="Edit recipient"
      onClose={onClose}
      size="sm"
      footer={<button type="submit" form="invoice-recipient" className="primary">Save recipient</button>}
    >
      <form
        id="invoice-recipient"
        className="invoice-dialog-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave({ billToName: name, billToEmail: email })
        }}
      >
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="No email yet" />
        </label>
      </form>
    </FormOverlay>
  )
}

function PaymentDialog({ balance, onClose, onRecord }) {
  const toast = useToast()
  const [amount, setAmount] = useState(feePenceToInput(balance))
  const [paidOn, setPaidOn] = useState(todayYmd())

  function onSubmit(event) {
    event.preventDefault()
    const parsed = parseFeePounds(amount)
    if (parsed.error || !parsed.pence) {
      toast.error(parsed.error || 'Enter the amount paid.')
      return
    }
    onRecord({ amountPence: parsed.pence, paidOn })
  }

  return (
    <FormOverlay
      title="Record payment"
      meta={`${formatGbpFromPence(balance)} still due`}
      onClose={onClose}
      size="sm"
      footer={<button type="submit" form="invoice-payment" className="primary">Record payment</button>}
    >
      <form id="invoice-payment" className="invoice-dialog-form" onSubmit={onSubmit}>
        <label>
          Amount (£)
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Date
          <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </label>
      </form>
    </FormOverlay>
  )
}

function OverflowMenu({ children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])
  const entries = [].concat(children).filter(Boolean)
  if (!entries.length) return null
  return (
    <div className="invoice-menu" ref={ref}>
      <button type="button" className="secondary invoice-menu__trigger" aria-expanded={open} aria-label="More invoice actions" onClick={() => setOpen((current) => !current)}>
        <DotsIcon />
      </button>
      {open && (
        <div className="invoice-menu__list" role="menu" onClick={() => setOpen(false)}>
          {entries}
        </div>
      )}
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2.5h4M3.5 4.5h9M5.2 4.5l.6 8h4.4l.6-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="3.2" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="12.8" r="1.2" fill="currentColor" />
    </svg>
  )
}
