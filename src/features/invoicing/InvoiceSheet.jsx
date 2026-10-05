import { useState } from 'react'
import LetterheadPreview from '../client/LetterheadPreview'
import { useToast } from '../../components/ui'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import { feePenceToInput, formatGbpFromPence, parseFeePounds } from '../../lib/money'
import { calendarMonthRange, inDateRange, matchesClientTag } from '../../lib/reporting'
import {
  invoiceBalancePence,
  invoiceDisplayStatus,
  invoiceStatusLabel,
  lineAmountPence,
  paidPence,
} from '../../lib/invoices'

export function InvoiceDocument({
  invoice,
  today,
  letterhead,
  paymentText,
  draftEditor = null,
  onRemovePayment,
}) {
  const display = invoiceDisplayStatus(invoice, today)
  const balance = invoiceBalancePence(invoice)
  const anyVat = invoice.lines.some((line) => line.includesVat)
  const showFor = invoice.forName && invoice.forName !== invoice.billToName
  return (
    <article className="invoice-sheet">
      <LetterheadPreview letterhead={letterhead} />
      <div className="invoice-sheet__meta">
        <div>
          <p className="invoice-sheet__kicker">{invoice.status === 'draft' ? 'Draft invoice' : 'Invoice'}</p>
          <h2>{invoice.number}</h2>
        </div>
        <dl>
          <div>
            <dt>Status</dt>
            <dd className={display === 'overdue' ? 'invoice-sheet__overdue' : undefined}>{invoiceStatusLabel(invoice, today)}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>{invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : 'When you send it'}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{invoice.dueOn ? formatDisplayDate(invoice.dueOn) : 'Set when you send it'}</dd>
          </div>
        </dl>
      </div>
      <p className="invoice-sheet__to">
        <span>To</span>
        {invoice.billToName}
        {invoice.billToEmail ? <span className="invoice-sheet__email">{invoice.billToEmail}</span> : null}
      </p>
      {draftEditor}
      {showFor ? <p className="invoice-sheet__to"><span>For</span> {invoice.forName}</p> : null}
      <table className="invoice-sheet__table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.length === 0 ? (
            <tr>
              <td colSpan={3}>No lines yet.</td>
            </tr>
          ) : invoice.lines.map((line) => (
            <tr key={line.id}>
              <td>
                {line.description}
                {line.includesVat ? <span className="invoice-sheet__vat"> incl. VAT</span> : null}
              </td>
              <td>{line.quantity}</td>
              <td>{formatGbpFromPence(lineAmountPence(line))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <td />
            <td>{formatGbpFromPence(invoice.totalPence)}</td>
          </tr>
          {invoice.payments.length > 0 && (
            <tr>
              <th>Paid</th>
              <td />
              <td>{formatGbpFromPence(paidPence(invoice.payments))}</td>
            </tr>
          )}
          {invoice.status !== 'draft' && invoice.status !== 'void' && (
            <tr>
              <th>{balance === 0 ? 'Balance' : 'Balance due'}</th>
              <td />
              <td>{formatGbpFromPence(balance)}</td>
            </tr>
          )}
        </tfoot>
      </table>
      {anyVat ? <p className="invoice-sheet__note">Lines marked incl. VAT already include VAT. The total is the amount to pay.</p> : null}
      {invoice.payments.length > 0 && (
        <ul className="invoice-sheet__payments">
          {invoice.payments.map((payment) => (
            <li key={payment.id}>
              <span>{formatDisplayDate(payment.paidOn)} · {formatGbpFromPence(payment.amountPence)}</span>
              {onRemovePayment ? (
                <button type="button" className="secondary invoicing-no-print" onClick={() => onRemovePayment(payment.id)}>Remove</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {paymentText ? (
        <footer className="invoice-sheet__pay">
          <h3>How to pay</h3>
          {paymentText.split('\n').map((line) => <p key={line}>{line}</p>)}
        </footer>
      ) : (
        <p className="invoice-sheet__note invoicing-no-print">Add payment details in Account settings before you send this, so the client knows where to pay.</p>
      )}
    </article>
  )
}

export default function InvoiceSheet({
  invoice,
  today,
  letterhead,
  paymentText,
  candidates,
  activities,
  services,
  tags,
  tagsByClient,
  onBack,
  onStatus,
  onSaveRecipient,
  onSaveLine,
  onAddLine,
  onRemoveLine,
  onRecordPayment,
  onRemovePayment,
}) {
  const draft = invoice.status === 'draft'
  const balance = invoiceBalancePence(invoice)

  return (
    <div className="invoicing-sheet-wrap">
      <div className="invoicing-sheet__toolbar invoicing-no-print">
        <button type="button" className="secondary" onClick={onBack}>All invoices</button>
        <div className="invoicing-sheet__actions">
          <button type="button" className="secondary" onClick={() => window.print()}>Print</button>
          {draft && (
            <button type="button" className="primary" onClick={() => onStatus('issued')}>Mark as sent</button>
          )}
          {invoice.status !== 'void' && (
            <button type="button" className="secondary" onClick={() => onStatus('void')}>Void</button>
          )}
        </div>
      </div>
      {draft && (
        <p className="text-muted invoicing-no-print">Mark as sent when the draft is ready. It becomes Awaiting payment. Print is how you send it until email is connected.</p>
      )}

      <InvoiceDocument
        invoice={invoice}
        today={today}
        letterhead={letterhead}
        paymentText={paymentText}
        draftEditor={draft ? (
          <RecipientEditor key={`${invoice.id}:${invoice.billToName}:${invoice.billToEmail}`} invoice={invoice} onSave={onSaveRecipient} />
        ) : null}
        onRemovePayment={invoice.status === 'void' ? undefined : onRemovePayment}
      />

      {draft && (
        <div className="invoicing-no-print">
          <section className="invoicing-block">
            <h2 className="invoicing-block__title">Lines on this draft</h2>
            {invoice.lines.length === 0 ? <p className="text-muted">Add a session, support or admin time, or a free line.</p> : null}
            {invoice.lines.map((line) => (
              <DraftLineEditor
                key={`${line.id}:${line.description}:${line.unitPence}:${line.quantity}:${line.includesVat}`}
                line={line}
                onSave={onSaveLine}
                onRemove={onRemoveLine}
              />
            ))}
          </section>
          <SessionPicker
            invoice={invoice}
            today={today}
            candidates={candidates}
            services={services}
            tags={tags}
            tagsByClient={tagsByClient}
            onAddLine={onAddLine}
          />
          <ActivityPicker invoice={invoice} activities={activities} onAddLine={onAddLine} />
          <FreeLineForm onAddLine={onAddLine} />
        </div>
      )}

      {invoice.status === 'issued' && balance > 0 && (
        <PaymentForm balance={balance} onRecord={onRecordPayment} />
      )}
    </div>
  )
}

function RecipientEditor({ invoice, onSave }) {
  const [name, setName] = useState(invoice.billToName)
  const [email, setEmail] = useState(invoice.billToEmail)
  return (
    <form
      className="invoicing-add-line invoicing-no-print"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ billToName: name, billToEmail: email })
      }}
    >
      <h2 className="invoicing-block__title">Who receives this invoice</h2>
      <p className="text-muted">This change stays on this draft. The saved contact is left as it is.</p>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="No email yet" />
      </label>
      <button type="submit" className="secondary">Save recipient</button>
    </form>
  )
}

function DraftLineEditor({ line, onSave, onRemove }) {
  const toast = useToast()
  const [description, setDescription] = useState(line.description)
  const [quantity, setQuantity] = useState(String(line.quantity || 1))
  const [amount, setAmount] = useState(feePenceToInput(line.unitPence))
  const [includesVat, setIncludesVat] = useState(line.includesVat)

  async function onSubmit(event) {
    event.preventDefault()
    const parsed = parseFeePounds(amount)
    if (parsed.error) {
      toast.error(parsed.error)
      return
    }
    const qty = Math.trunc(Number(quantity))
    if (!qty || qty < 1) {
      toast.error('Enter a quantity of at least 1.')
      return
    }
    await onSave(line.id, {
      appointmentId: line.appointmentId,
      description,
      sessionDate: line.sessionDate,
      unitPence: parsed.pence ?? 0,
      quantity: qty,
      includesVat,
    })
  }

  return (
    <form className="invoicing-add-line" onSubmit={onSubmit}>
      <label>
        Description
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        Quantity
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Price (£)
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
      </label>
      <label className="invoicing-add-line__check">
        <input type="checkbox" checked={includesVat} onChange={(event) => setIncludesVat(event.target.checked)} />
        Includes VAT
      </label>
      <div className="invoicing-add-line__actions">
        <button type="submit" className="secondary">Save line</button>
        <button type="button" className="secondary" onClick={() => onRemove(line.id)}>Remove</button>
      </div>
    </form>
  )
}

function SessionPicker({ invoice, today, candidates, services, tags, tagsByClient, onAddLine }) {
  const [range, setRange] = useState(() => calendarMonthRange(today || todayYmd()))
  const [include, setInclude] = useState('both')
  const [serviceId, setServiceId] = useState('')
  const [tagId, setTagId] = useState('')
  const rows = candidates.filter((item) => {
    if (invoice.clientId && item.clientId && item.clientId !== invoice.clientId) return false
    if (!inDateRange(item.sessionDate, range)) return false
    if (!item.pricedActivity) {
      if (include === 'held' && !item.marked) return false
      if (include === 'booked' && item.marked) return false
    }
    if (serviceId && item.serviceId !== serviceId) return false
    return matchesClientTag(item.clientId, tagId, tagsByClient)
  })

  return (
    <section className="invoicing-block">
      <h2 className="invoicing-block__title">Add a session</h2>
      <div className="invoicing-filters">
        <label className="invoicing-filters__field">
          From
          <input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label className="invoicing-filters__field">
          To
          <input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <label className="invoicing-filters__field">
          Include
          <select value={include} onChange={(event) => setInclude(event.target.value)}>
            <option value="both">Held and booked</option>
            <option value="held">Held sessions</option>
            <option value="booked">Booked sessions</option>
          </select>
        </label>
        <label className="invoicing-filters__field">
          Service
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="">All services</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label className="invoicing-filters__field">
          Tag
          <select value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">All tags</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </label>
      </div>
      {rows.length === 0 ? <p className="text-muted">No uninvoiced sessions match.</p> : (
        <ul className="invoicing-ready__lines invoicing-picker">
          {rows.map((item) => (
            <li key={item.appointmentId}>
              <span>{item.line.description}{item.line.includesVat ? ' · incl. VAT' : ''}</span>
              <span>{formatGbpFromPence(item.line.unitPence)}</span>
              <button type="button" className="secondary" onClick={() => onAddLine(item.line)}>Add</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ActivityPicker({ invoice, activities, onAddLine }) {
  const rows = activities.filter((item) => !invoice.clientId || !item.clientId || item.clientId === invoice.clientId)
  if (!rows.length) return null
  return (
    <section className="invoicing-block">
      <h2 className="invoicing-block__title">Add support or admin time</h2>
      <ul className="invoicing-ready__lines invoicing-picker">
        {rows.map((item) => (
          <ActivityRow key={item.appointmentId} item={item} onAddLine={onAddLine} />
        ))}
      </ul>
    </section>
  )
}

function ActivityRow({ item, onAddLine }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')

  function onAdd() {
    const parsed = parseFeePounds(amount)
    if (parsed.error) {
      toast.error(parsed.error)
      return
    }
    onAddLine({ ...item.line, unitPence: parsed.pence ?? 0 })
  }

  return (
    <li>
      <span>{item.line.description}</span>
      <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Price in pounds" />
      <button type="button" className="secondary" onClick={onAdd}>Add</button>
    </li>
  )
}

function FreeLineForm({ onAddLine }) {
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [sessionDate, setSessionDate] = useState(todayYmd())
  const [amount, setAmount] = useState('')
  const [includesVat, setIncludesVat] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const parsed = parseFeePounds(amount)
    if (parsed.error || parsed.pence == null) {
      toast.error(parsed.error || 'Enter an amount.')
      return
    }
    const qty = Math.trunc(Number(quantity))
    if (!qty || qty < 1) {
      toast.error('Enter a quantity of at least 1.')
      return
    }
    const saved = await onAddLine({
      appointmentId: null,
      description,
      sessionDate: sessionDate || null,
      unitPence: parsed.pence,
      quantity: qty,
      includesVat,
    })
    if (!saved) return
    setDescription('')
    setQuantity('1')
    setAmount('')
    setIncludesVat(false)
  }

  return (
    <form className="invoicing-add-line" onSubmit={onSubmit}>
      <h2 className="invoicing-block__title">Add a free line</h2>
      <label>
        Description
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Report or letter" />
      </label>
      <label>
        Quantity
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Date
        <input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
      </label>
      <label>
        Price (£)
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="80.00" />
      </label>
      <label className="invoicing-add-line__check">
        <input type="checkbox" checked={includesVat} onChange={(event) => setIncludesVat(event.target.checked)} />
        Includes VAT
      </label>
      <button type="submit" className="secondary">Add line</button>
    </form>
  )
}

function PaymentForm({ balance, onRecord }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(todayYmd())

  async function onSubmit(event) {
    event.preventDefault()
    const parsed = parseFeePounds(amount)
    if (parsed.error || !parsed.pence) {
      toast.error(parsed.error || 'Enter the amount paid.')
      return
    }
    const saved = await onRecord({ amountPence: parsed.pence, paidOn })
    if (saved) setAmount('')
  }

  return (
    <form className="invoicing-add-line invoicing-no-print" onSubmit={onSubmit}>
      <h2 className="invoicing-block__title">Record a payment</h2>
      <p className="text-muted">{formatGbpFromPence(balance)} is still open. A smaller amount leaves the invoice partially paid.</p>
      <label>
        Amount (£)
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder={feePenceToInput(balance)} />
      </label>
      <label>
        Date
        <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
      </label>
      <button type="submit" className="primary">Record payment</button>
    </form>
  )
}
