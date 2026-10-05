import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import RecordTable from '../../components/RecordTable'
import LetterheadPreview from '../client/LetterheadPreview'
import { useConfirm, useToast } from '../../components/ui'
import { useAppSession } from '../../lib/AppSessionContext'
import { useClientsQuery } from '../../lib/queries'
import { useAllAppointmentsQuery } from '../../lib/appointmentQueries'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import { formatGbpFromPence, parseFeePounds } from '../../lib/money'
import { loadCancellationPolicy } from '../../lib/supabase/cancellationPolicyRepo'
import { listServices } from '../../lib/supabase/servicesRepo'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import { loadClinicianPrintIdentity, preferredLetterhead, printLetterheadFromRow } from '../../lib/letterheadPrint'
import { DEFAULT_CANCELLATION_POLICY } from '../../lib/cancellationPolicy'
import { inDateRange, monthToDateRange } from '../../lib/reporting'
import {
  activeBilledAppointmentIds,
  EMPTY_PAYMENT,
  invoiceRecipient,
  invoiceStatusLabel,
  invoiceTotalPence,
  lineForInvoice,
  paymentInstructions,
} from '../../lib/invoices'
import { listContacts } from '../../lib/supabase/contactsRepo'
import {
  addInvoiceLine,
  createInvoice,
  listInvoices,
  loadPaymentDetails,
  removeInvoiceLine,
  setInvoiceStatus,
} from '../../lib/supabase/invoicesRepo'

const EMPTY_LIST = []

export default function InvoicingPage() {
  const { session } = useAppSession()
  const userId = session?.user?.id
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [openId, setOpenId] = useState(null)
  const [creatingId, setCreatingId] = useState('')
  const [range, setRange] = useState(() => monthToDateRange(todayYmd()))
  const [include, setInclude] = useState('held')
  const [unticked, setUnticked] = useState({})

  const invoicesQuery = useQuery({
    queryKey: ['invoices', userId],
    queryFn: listInvoices,
    enabled: Boolean(userId),
  })
  const appointmentsQuery = useAllAppointmentsQuery()
  const clientsQuery = useClientsQuery({ userId })
  const servicesQuery = useQuery({
    queryKey: ['services', 'invoicing'],
    queryFn: listServices,
    enabled: Boolean(userId),
  })
  const policyQuery = useQuery({
    queryKey: ['cancellation-policy', userId],
    queryFn: loadCancellationPolicy,
    enabled: Boolean(userId),
  })
  const contactsQuery = useQuery({
    queryKey: ['contacts', 'invoicing', userId],
    queryFn: () => listContacts(),
    enabled: Boolean(userId),
  })
  const letterheadsQuery = useQuery({
    queryKey: ['letterheads', userId],
    queryFn: listLetterheads,
    enabled: Boolean(userId),
  })
  const identityQuery = useQuery({
    queryKey: ['print-identity', userId],
    queryFn: () => loadClinicianPrintIdentity(userId),
    enabled: Boolean(userId),
  })

  const services = servicesQuery.data || EMPTY_LIST
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const invoices = invoicesQuery.data || EMPTY_LIST
  const policy = policyQuery.data || DEFAULT_CANCELLATION_POLICY
  const clients = clientsQuery.data || EMPTY_LIST
  const clientName = useMemo(() => {
    const names = new Map()
    for (const client of clients) names.set(client.id, client.real_name || 'Client')
    return names
  }, [clients])

  const contactsByClient = useMemo(() => {
    const map = new Map()
    for (const contact of contactsQuery.data || []) {
      const list = map.get(contact.clientId) || []
      list.push(contact)
      map.set(contact.clientId, list)
    }
    return map
  }, [contactsQuery.data])

  const groups = useMemo(() => {
    const billed = activeBilledAppointmentIds(invoices)
    const byClient = new Map()
    for (const appointment of appointmentsQuery.data || []) {
      const report = toReportAppointment(appointment, serviceById)
      if (!inDateRange(report.sessionDate, range)) continue
      const line = lineForInvoice(report, policy, include)
      if (!line || !report.clientId || billed.has(report.id)) continue
      const client = clients.find((item) => item.id === report.clientId)
      const recipient = invoiceRecipient({
        clientName: client?.real_name || report.clientName || 'Client',
        clientEmail: client?.email || '',
        contacts: contactsByClient.get(report.clientId) || [],
      })
      const current = byClient.get(report.clientId) || {
        clientId: report.clientId,
        name: client?.real_name || report.clientName || 'Client',
        billToName: recipient.billToName,
        billToEmail: recipient.billToEmail,
        lines: [],
      }
      current.lines.push(line)
      byClient.set(report.clientId, current)
    }
    return [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [appointmentsQuery.data, serviceById, invoices, policy, clients, range, include, contactsByClient])

  const open = invoices.find((invoice) => invoice.id === openId) || null
  const paymentQuery = useQuery({
    queryKey: ['invoice-payment', userId],
    queryFn: loadPaymentDetails,
    enabled: Boolean(userId) && open?.status === 'draft',
  })
  const letterhead = printLetterheadFromRow(
    preferredLetterhead(letterheadsQuery.data || []),
    identityQuery.data || { clinicianName: '', professionalTitle: '' },
  )
  const toInvoicePence = groups.reduce((sum, group) => sum + invoiceTotalPence(group.lines), 0)
  const draftCount = invoices.filter((invoice) => invoice.status === 'draft').length
  const outstandingPence = invoices
    .filter((invoice) => invoice.status === 'issued')
    .reduce((sum, invoice) => sum + invoice.totalPence, 0)

  function remember(invoice) {
    queryClient.setQueryData(['invoices', userId], (current) => {
      const list = Array.isArray(current) ? current : []
      if (!invoice) return list.filter((item) => item.id !== openId)
      return [invoice, ...list.filter((item) => item.id !== invoice.id)]
    })
    queryClient.invalidateQueries({ queryKey: ['invoices', userId] })
  }

  function tickedLines(group) {
    return group.lines.filter((line) => line.appointmentId && !unticked[line.appointmentId])
  }

  async function onCreate(group) {
    const lines = tickedLines(group)
    if (!lines.length) {
      toast.error('Tick at least one session.')
      return
    }
    setCreatingId(group.clientId)
    try {
      const invoice = await createInvoice({
        clientId: group.clientId,
        billToName: group.billToName,
        billToEmail: group.billToEmail,
        lines,
      })
      remember(invoice)
      setOpenId(invoice.id)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoice')
    } finally {
      setCreatingId('')
    }
  }

  async function onCreateEach() {
    const ready = groups
      .map((group) => ({ ...group, lines: tickedLines(group) }))
      .filter((group) => group.lines.length)
    if (!ready.length) {
      toast.error('Tick at least one session.')
      return
    }
    setCreatingId('all')
    try {
      let last = null
      for (const group of ready) {
        last = await createInvoice({
          clientId: group.clientId,
          billToName: group.billToName,
          billToEmail: group.billToEmail,
          lines: group.lines,
        })
        remember(last)
      }
      if (ready.length === 1 && last) setOpenId(last.id)
      else toast.success(`Created ${ready.length} invoices`)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoices')
    } finally {
      setCreatingId('')
    }
  }

  async function onStatus(status) {
    if (!open) return
    if (status === 'void') {
      const ok = await confirm({
        title: 'Void this invoice?',
        message: 'The sessions on it can be invoiced again.',
        confirmLabel: 'Void invoice',
        tone: 'danger',
      })
      if (!ok) return
    }
    try {
      remember(await setInvoiceStatus(open.id, status))
    } catch (err) {
      toast.error(err?.message || 'Could not update the invoice')
    }
  }

  async function onAddLine(line) {
    if (!open) return false
    try {
      remember(await addInvoiceLine(open.id, line))
      return true
    } catch (err) {
      toast.error(err?.message || 'Could not add that line')
      return false
    }
  }

  async function onRemoveLine(lineId) {
    if (!open) return
    try {
      const next = await removeInvoiceLine(open.id, lineId)
      remember(next)
      if (!next) setOpenId(null)
    } catch (err) {
      toast.error(err?.message || 'Could not remove that line')
    }
  }

  const rows = invoices.map((invoice) => ({
    id: invoice.id,
    filterValues: {
      number: invoice.number,
      client: invoice.billToName,
      status: invoiceStatusLabel(invoice.status),
    },
    sortValues: {
      number: invoice.number,
      client: invoice.billToName,
      status: invoice.status,
      issued: invoice.issuedOn || '',
      total: invoice.totalPence,
    },
    cells: {
      number: invoice.number,
      client: invoice.billToName,
      status: invoiceStatusLabel(invoice.status),
      issued: invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : '—',
      total: formatGbpFromPence(invoice.totalPence),
    },
  }))

  return (
    <div className="page page--invoicing">
      <PageHeader
        className={open ? 'invoicing-no-print' : ''}
        title="Invoicing"
        subtitle="Create an invoice from sessions, then print it and send it. Payment details are in Account settings."
      />

      {open ? (
        <InvoiceSheet
          invoice={open}
          letterhead={letterhead}
          paymentText={open.status === 'draft' ? paymentInstructions(paymentQuery.data || EMPTY_PAYMENT) : open.paymentDetails}
          forName={clientName.get(open.clientId) || ''}
          onBack={() => setOpenId(null)}
          onStatus={onStatus}
          onAddLine={onAddLine}
          onRemoveLine={onRemoveLine}
        />
      ) : (
        <>
          <div className="section-card__stat-row">
            <Stat label="To invoice" value={formatGbpFromPence(toInvoicePence)} detail="Sessions in these dates" />
            <Stat label="Drafts" value={draftCount} />
            <Stat label="Outstanding" value={formatGbpFromPence(outstandingPence)} detail="Issued, not marked paid" />
          </div>

          <section className="invoicing-block">
            <div className="invoicing-ready__head">
              <h2 className="invoicing-block__title">Sessions to invoice</h2>
              <button
                type="button"
                className="primary"
                disabled={creatingId === 'all' || groups.every((group) => tickedLines(group).length === 0)}
                onClick={onCreateEach}
              >
                Create an invoice for each client
              </button>
            </div>
            <div className="invoicing-filters">
              <label className="invoicing-filters__field">
                From
                <input
                  type="date"
                  value={range.from}
                  onChange={(event) => {
                    setRange((current) => ({ ...current, from: event.target.value }))
                    setUnticked({})
                  }}
                />
              </label>
              <label className="invoicing-filters__field">
                To
                <input
                  type="date"
                  value={range.to}
                  onChange={(event) => {
                    setRange((current) => ({ ...current, to: event.target.value }))
                    setUnticked({})
                  }}
                />
              </label>
              <label className="invoicing-filters__field">
                Include
                <select
                  value={include}
                  onChange={(event) => {
                    setInclude(event.target.value)
                    setUnticked({})
                  }}
                >
                  <option value="held">Held sessions</option>
                  <option value="booked">Booked sessions</option>
                  <option value="both">Held and booked</option>
                </select>
              </label>
            </div>
            <p className="text-muted">Held sessions use the fee already stored. Booked sessions use the service price, so you can invoice before they happen. Tick the lines you want.</p>
            {groups.length === 0 ? (
              <p className="text-muted">Nothing to invoice in these dates.</p>
            ) : groups.map((group) => (
              <article key={group.clientId} className="invoicing-ready">
                <div className="invoicing-ready__head">
                  <div>
                    <h3>{group.name}</h3>
                    <p>
                      {tickedLines(group).length} of {group.lines.length} ticked · {formatGbpFromPence(invoiceTotalPence(tickedLines(group)))}
                    </p>
                    <p>{group.billToEmail ? `Invoices go to ${group.billToName} · ${group.billToEmail}` : `Invoices go to ${group.billToName}. No email yet.`}</p>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={creatingId === group.clientId || tickedLines(group).length === 0}
                    onClick={() => onCreate(group)}
                  >
                    Create invoice
                  </button>
                </div>
                <ul className="invoicing-ready__lines">
                  {group.lines.map((line) => (
                    <li key={line.appointmentId || line.description}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!unticked[line.appointmentId]}
                          onChange={() => setUnticked((current) => ({
                            ...current,
                            [line.appointmentId]: !current[line.appointmentId],
                          }))}
                        />
                        <span>{line.description}{line.includesVat ? ' · incl. VAT' : ''}</span>
                      </label>
                      <span>{formatGbpFromPence(line.unitPence)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <section className="invoicing-block">
            <h2 className="invoicing-block__title">Invoices</h2>
            <RecordTable
              columns={[
                { key: 'number', label: 'Number', filter: 'text', sort: 'text' },
                { key: 'client', label: 'Client', filter: 'text', sort: 'text' },
                { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
                { key: 'issued', label: 'Issued', sort: 'text' },
                { key: 'total', label: 'Total', sort: 'number' },
              ]}
              rows={rows}
              onRowClick={(row) => setOpenId(row.id)}
              countNoun="invoices"
              emptyMessage="No invoices yet."
            />
          </section>
        </>
      )}
    </div>
  )
}

function InvoiceSheet({ invoice, letterhead, paymentText, forName, onBack, onStatus, onAddLine, onRemoveLine }) {
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [sessionDate, setSessionDate] = useState(todayYmd())
  const [amount, setAmount] = useState('')
  const [includesVat, setIncludesVat] = useState(false)
  const anyVat = invoice.lines.some((line) => line.includesVat)
  const draft = invoice.status === 'draft'

  async function onSubmitLine(event) {
    event.preventDefault()
    const parsed = parseFeePounds(amount)
    if (parsed.error || parsed.pence == null) {
      toast.error(parsed.error || 'Enter an amount.')
      return
    }
    const saved = await onAddLine({
      appointmentId: null,
      description,
      sessionDate: sessionDate || null,
      unitPence: parsed.pence,
      includesVat,
    })
    if (!saved) return
    setDescription('')
    setAmount('')
    setIncludesVat(false)
  }

  return (
    <div className="invoicing-sheet-wrap">
      <div className="invoicing-sheet__toolbar invoicing-no-print">
        <button type="button" className="secondary" onClick={onBack}>All invoices</button>
        <div className="invoicing-sheet__actions">
          <button type="button" className="secondary" onClick={() => window.print()}>Print</button>
          {draft && (
            <button type="button" className="primary" onClick={() => onStatus('issued')}>Mark as issued</button>
          )}
          {invoice.status === 'issued' && (
            <button type="button" className="primary" onClick={() => onStatus('paid')}>Mark as paid</button>
          )}
          {invoice.status === 'paid' && (
            <button type="button" className="secondary" onClick={() => onStatus('issued')}>Mark as unpaid</button>
          )}
          {(draft || invoice.status === 'issued') && (
            <button type="button" className="secondary" onClick={() => onStatus('void')}>Void</button>
          )}
        </div>
      </div>

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
              <dd>{invoiceStatusLabel(invoice.status)}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : 'When you issue it'}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{invoice.dueOn ? formatDisplayDate(invoice.dueOn) : 'Set when you issue it'}</dd>
            </div>
          </dl>
        </div>
        <p className="invoice-sheet__to">
          <span>To</span>
          {invoice.billToName}
          {invoice.billToEmail ? <span className="invoice-sheet__email">{invoice.billToEmail}</span> : null}
        </p>
        {forName && forName !== invoice.billToName ? <p className="invoice-sheet__to"><span>For</span> {forName}</p> : null}
        <table className="invoice-sheet__table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount</th>
              {draft ? <th className="invoicing-no-print" /> : null}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.description}
                  {line.includesVat ? <span className="invoice-sheet__vat"> incl. VAT</span> : null}
                </td>
                <td>{formatGbpFromPence(line.unitPence)}</td>
                {draft ? (
                  <td className="invoicing-no-print">
                    <button type="button" className="secondary" onClick={() => onRemoveLine(line.id)}>Remove</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <td>{formatGbpFromPence(invoice.totalPence)}</td>
              {draft ? <td className="invoicing-no-print" /> : null}
            </tr>
          </tfoot>
        </table>
        {anyVat ? <p className="invoice-sheet__note">Lines marked incl. VAT already include VAT. The total is the amount to pay.</p> : null}
        {paymentText ? (
          <footer className="invoice-sheet__pay">
            <h3>How to pay</h3>
            {paymentText.split('\n').map((line) => <p key={line}>{line}</p>)}
          </footer>
        ) : (
          <p className="invoice-sheet__note invoicing-no-print">Add payment details before you send this, so the client knows where to pay.</p>
        )}
      </article>

      {draft && (
        <form className="invoicing-add-line invoicing-no-print" onSubmit={onSubmitLine}>
          <h2 className="invoicing-block__title">Add a line</h2>
          <label>
            Description
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Report or letter" />
          </label>
          <label>
            Date
            <input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
          </label>
          <label>
            Amount (£)
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="80.00" />
          </label>
          <label className="invoicing-add-line__check">
            <input type="checkbox" checked={includesVat} onChange={(event) => setIncludesVat(event.target.checked)} />
            Includes VAT
          </label>
          <button type="submit" className="secondary">Add line</button>
        </form>
      )}
    </div>
  )
}

function Stat({ label, value, detail }) {
  return (
    <div className="section-card__stat">
      <span className="section-card__stat-value">{value}</span>
      <span className="section-card__stat-label">{label}</span>
      {detail ? <span className="invoicing-stat__detail">{detail}</span> : null}
    </div>
  )
}

function toReportAppointment(appointment, serviceById) {
  const service = serviceById.get(appointment.service_id) || null
  return {
    id: appointment.id,
    clientId: appointment.client_id || null,
    clientName: appointment.client_name || '—',
    serviceId: appointment.service_id || null,
    serviceName: appointment.service_name || service?.name || '',
    sessionDate: appointment.session_date,
    startTime: appointment.start_time,
    endTime: appointment.end_time,
    attendance: appointment.attendance_status || null,
    blockRole: appointment.block_role || 'client_session',
    externalBusy: Boolean(appointment.is_external_busy),
    doNotInvoice: Boolean(appointment.do_not_invoice),
    chargedPence: appointment.charged_pence ?? null,
    feePence: service?.fee_pence ?? null,
    feeIncludesVat: Boolean(service?.fee_includes_vat),
  }
}
