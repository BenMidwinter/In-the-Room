import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import FormOverlay from '../../components/FormOverlay'
import { useConfirm, useToast } from '../../components/ui'
import { useAppSession } from '../../lib/AppSessionContext'
import { useClientsQuery } from '../../lib/queries'
import { useAllAppointmentsQuery, useSaveAppointmentMutation } from '../../lib/appointmentQueries'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import { formatGbpFromPence, parseFeePounds } from '../../lib/money'
import { loadCancellationPolicy } from '../../lib/supabase/cancellationPolicyRepo'
import { listServices } from '../../lib/supabase/servicesRepo'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import { loadClinicianPrintIdentity, preferredLetterhead, printLetterheadFromRow } from '../../lib/letterheadPrint'
import { chargeForAttendance, DEFAULT_CANCELLATION_POLICY } from '../../lib/cancellationPolicy'
import { roleOf } from '../../lib/reporting'
import { concessionFromClient, sessionBasePence } from '../../lib/sessionPrice'
import {
  activeBilledAppointmentIds,
  EMPTY_PAYMENT,
  invoiceBalancePence,
  invoiceDisplayStatus,
  invoiceRecipient,
  lineForInvoice,
  paidPence,
  paymentInstructions,
  readyInvoiceGroups,
} from '../../lib/invoices'
import { listContacts } from '../../lib/supabase/contactsRepo'
import {
  addInvoiceLine,
  createInvoice,
  deleteInvoice,
  listInvoices,
  loadPaymentDetails,
  recordInvoicePayment,
  removeInvoiceLine,
  removeInvoicePayment,
  setInvoiceStatus,
  updateInvoiceLine,
  updateInvoiceRecipient,
} from '../../lib/supabase/invoicesRepo'
import InvoiceSheet from './InvoiceSheet'

const EMPTY_LIST = []
const STATUS_LABEL = {
  draft: 'Draft',
  awaiting: 'Sent',
  partial: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

export default function InvoicingPage() {
  const { session } = useAppSession()
  const userId = session?.user?.id
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const saveAppointment = useSaveAppointmentMutation()
  const [params, setParams] = useSearchParams()
  const openId = params.get('invoice')
  const tab = params.get('tab') === 'unbilled' ? 'unbilled' : 'invoices'
  const today = todayYmd()
  const [creatingId, setCreatingId] = useState('')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sessionQuery, setSessionQuery] = useState('')
  const [selected, setSelected] = useState({})
  const [chooserOpen, setChooserOpen] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const [feeItem, setFeeItem] = useState(null)
  const [feeAmount, setFeeAmount] = useState('')

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
  const contactsByClient = useMemo(() => {
    const map = new Map()
    for (const contact of contactsQuery.data || []) {
      const list = map.get(contact.clientId) || []
      list.push(contact)
      map.set(contact.clientId, list)
    }
    return map
  }, [contactsQuery.data])

  const items = useMemo(() => {
    const billed = activeBilledAppointmentIds(invoices)
    const rows = []
    for (const appointment of appointmentsQuery.data || []) {
      const client = clients.find((item) => item.id === appointment.client_id)
      const report = toReportAppointment(appointment, serviceById, client)
      if (report.externalBusy || billed.has(report.id) || report.doNotInvoice) continue
      const role = roleOf(report)
      if (role === 'busy') continue
      const activity = role === 'support' || role === 'admin'
      if (!activity && !report.clientId) continue
      const line = lineForInvoice(report, policy, activity || report.attendance ? 'both' : 'booked')
      const hasFee = Boolean(line && line.unitPence > 0)
      const held = activity ? Boolean(report.sessionDate && report.sessionDate <= today) : Boolean(report.attendance)
      const recipient = report.clientId
        ? invoiceRecipient({
          clientName: client?.real_name || report.clientName || 'Client',
          clientEmail: client?.email || '',
          contacts: contactsByClient.get(report.clientId) || [],
        })
        : { billToName: 'Practice', billToEmail: '', billedToContact: false }
      rows.push({
        appointment,
        appointmentId: report.id,
        clientId: report.clientId,
        clientName: report.clientId ? (client?.real_name || report.clientName || 'Client') : 'Practice',
        serviceName: report.serviceName || (role === 'support' ? 'Support' : role === 'admin' ? 'Admin' : 'Session'),
        sessionDate: report.sessionDate,
        held,
        hasFee,
        pricedActivity: activity,
        doNotInvoice: false,
        billToName: recipient.billToName,
        billToEmail: recipient.billToEmail,
        billedToContact: Boolean(recipient.billedToContact),
        line: hasFee ? line : null,
      })
    }
    rows.sort((a, b) => String(b.sessionDate).localeCompare(String(a.sessionDate)) || a.clientName.localeCompare(b.clientName))
    return rows
  }, [appointmentsQuery.data, serviceById, invoices, policy, clients, contactsByClient, today])

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

  const draftCount = invoices.filter((invoice) => invoice.status === 'draft').length
  const outstandingPence = invoices
    .filter((invoice) => invoice.status === 'issued')
    .reduce((sum, invoice) => sum + invoiceBalancePence(invoice), 0)
  const paidTotal = invoices
    .filter((invoice) => invoice.status !== 'void')
    .reduce((sum, invoice) => sum + paidPence(invoice.payments), 0)

  const invoiceNeedle = invoiceQuery.trim().toLowerCase()
  const visibleInvoices = invoices.filter((invoice) => {
    const display = invoiceDisplayStatus(invoice, today)
    if (statusFilter === 'sent' && display !== 'awaiting') return false
    if (statusFilter && statusFilter !== 'sent' && display !== statusFilter) return false
    if (!invoiceNeedle) return true
    return `${invoice.number} ${invoice.billToName} ${invoice.forName}`.toLowerCase().includes(invoiceNeedle)
  })

  const sessionNeedle = sessionQuery.trim().toLowerCase()
  const unbilled = items.filter((item) => item.held && (
    !sessionNeedle || `${item.clientName} ${item.serviceName}`.toLowerCase().includes(sessionNeedle)
  ))
  const pricedUnbilled = unbilled.filter((item) => item.hasFee)
  const selectedItems = pricedUnbilled.filter((item) => selected[item.appointmentId])
  const clientChoices = [...clients]
    .filter((client) => !clientQuery.trim() || String(client.real_name || '').toLowerCase().includes(clientQuery.trim().toLowerCase()))
    .sort((a, b) => String(a.real_name || '').localeCompare(String(b.real_name || '')))

  function setTab(nextTab) {
    const next = new URLSearchParams(params)
    next.delete('invoice')
    if (nextTab === 'unbilled') next.set('tab', 'unbilled')
    else next.delete('tab')
    setParams(next)
  }

  function showInvoice(id) {
    const next = new URLSearchParams(params)
    if (id) next.set('invoice', id)
    else next.delete('invoice')
    setParams(next)
  }

  function remember(invoice) {
    queryClient.setQueryData(['invoices', userId], (current) => {
      const list = Array.isArray(current) ? current : []
      if (!invoice) return list.filter((item) => item.id !== openId)
      return [invoice, ...list.filter((item) => item.id !== invoice.id)]
    })
    queryClient.invalidateQueries({ queryKey: ['invoices', userId] })
  }

  function recipientFor(clientId) {
    const client = clients.find((item) => item.id === clientId)
    return invoiceRecipient({
      clientName: client?.real_name || 'Client',
      clientEmail: client?.email || '',
      contacts: contactsByClient.get(clientId) || [],
    })
  }

  async function createDrafts(sourceItems) {
    const groups = readyInvoiceGroups(sourceItems.filter((item) => item.line).map((item) => ({
      clientId: item.clientId,
      clientName: item.clientName,
      billToName: item.billToName,
      billToEmail: item.billToEmail,
      billedToContact: item.billedToContact,
      marked: true,
      pricedActivity: item.pricedActivity,
      line: item.line,
    })), { includeUnheld: true })
    if (!groups.length) {
      toast.error('Set a fee before invoicing.')
      return []
    }
    const created = []
    for (const group of groups) {
      const names = group.forName.split(', ').filter(Boolean)
      const lines = names.length > 1
        ? group.lines.map((line) => {
          const source = sourceItems.find((item) => item.appointmentId === line.appointmentId)
          return source ? { ...line, description: `${source.clientName} — ${line.description}` } : line
        })
        : group.lines
      const invoice = await createInvoice({
        clientId: group.clientId,
        billToName: group.billToName,
        billToEmail: group.billToEmail,
        forName: group.forName,
        lines,
      })
      remember(invoice)
      created.push(invoice)
    }
    return created
  }

  async function onCreateFor(sourceItems) {
    setCreatingId('batch')
    try {
      const created = await createDrafts(sourceItems)
      setSelected({})
      if (created.length === 1) showInvoice(created[0].id)
      else if (created.length > 1) {
        toast.success(`Created ${created.length} drafts`)
        setTab('invoices')
      }
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoice')
    } finally {
      setCreatingId('')
    }
  }

  async function onStartBlank(clientId) {
    const client = clients.find((item) => item.id === clientId)
    const recipient = recipientFor(clientId)
    setCreatingId(clientId)
    try {
      const invoice = await createInvoice({
        clientId,
        billToName: recipient.billToName,
        billToEmail: recipient.billToEmail,
        forName: client?.real_name || '',
        lines: [],
      })
      remember(invoice)
      setChooserOpen(false)
      showInvoice(invoice.id)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoice')
    } finally {
      setCreatingId('')
    }
  }

  async function onSetFee(event) {
    event.preventDefault()
    if (!feeItem || !userId) return
    const parsed = parseFeePounds(feeAmount)
    if (parsed.error || parsed.pence == null) {
      toast.error(parsed.error || 'Enter a fee.')
      return
    }
    const appointment = feeItem.appointment
    const service = serviceById.get(appointment.service_id)
    const client = clients.find((item) => item.id === appointment.client_id)
    const price = sessionBasePence({
      feePence: service?.fee_pence ?? null,
      overridePence: parsed.pence,
      concession: concessionFromClient(client),
    })
    const charge = appointment.attendance_status
      ? chargeForAttendance({
        attendance: appointment.attendance_status,
        sessionDate: appointment.session_date,
        startTime: appointment.start_time,
        feePence: price.pence,
        policy,
        doNotInvoice: appointment.do_not_invoice,
      })
      : null
    setCreatingId(feeItem.appointmentId)
    try {
      await saveAppointment.mutateAsync({
        payload: {
          id: appointment.id,
          client_id: appointment.client_id,
          session_date: appointment.session_date,
          start_time: appointment.start_time,
          end_time: appointment.end_time,
          appointment_type: appointment.appointment_type,
          service_id: appointment.service_id,
          block_role: appointment.block_role || 'client_session',
          clinician_id: appointment.clinician_id,
          attendance_status: appointment.attendance_status,
          fee_override_pence: parsed.pence,
          ...(charge ? { charged_pence: charge.chargedPence, do_not_invoice: charge.doNotInvoice } : {}),
        },
        userId,
      })
      setFeeItem(null)
      setFeeAmount('')
      toast.success('Fee saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save the fee')
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
    if (status === 'issued') {
      const details = await loadPaymentDetails()
      if (!paymentInstructions(details).trim()) {
        toast.error('Add payment details in Account settings before you send this.')
        return
      }
    }
    try {
      remember(await setInvoiceStatus(open.id, status))
      if (status === 'issued') toast.success('Invoice sent')
    } catch (err) {
      toast.error(err?.message || 'Could not update the invoice')
    }
  }

  async function onDelete() {
    if (!open) return
    const ok = await confirm({
      title: 'Delete this draft?',
      message: 'The sessions on it return to unbilled.',
      confirmLabel: 'Delete draft',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteInvoice(open.id)
      remember(null)
      showInvoice(null)
    } catch (err) {
      toast.error(err?.message || 'Could not delete the invoice')
    }
  }

  async function onSaveRecipient(input) {
    if (!open) return
    try {
      remember(await updateInvoiceRecipient(open.id, input))
    } catch (err) {
      toast.error(err?.message || 'Could not save the recipient')
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

  async function onSaveLine(lineId, line) {
    if (!open) return
    try {
      remember(await updateInvoiceLine(open.id, lineId, line))
    } catch (err) {
      toast.error(err?.message || 'Could not save that line')
    }
  }

  async function onRemoveLine(lineId) {
    if (!open) return
    try {
      remember(await removeInvoiceLine(open.id, lineId))
    } catch (err) {
      toast.error(err?.message || 'Could not remove that line')
    }
  }

  async function onRecordPayment(input) {
    if (!open) return false
    try {
      remember(await recordInvoicePayment(open.id, input))
      return true
    } catch (err) {
      toast.error(err?.message || 'Could not record that payment')
      return false
    }
  }

  async function onRemovePayment(paymentId) {
    if (!open) return
    try {
      remember(await removeInvoicePayment(open.id, paymentId))
    } catch (err) {
      toast.error(err?.message || 'Could not remove that payment')
    }
  }

  if (openId && !open) {
    return (
      <div className="page page--invoicing">
        <PageHeader title="Invoicing" />
        {invoicesQuery.isLoading ? <p className="text-muted">Loading invoice…</p> : (
          <button type="button" className="secondary" onClick={() => showInvoice(null)}>← Invoices</button>
        )}
      </div>
    )
  }

  if (open) {
    return (
      <div className="page page--invoicing">
        <InvoiceSheet
          invoice={open}
          today={today}
          letterhead={letterhead}
          paymentText={open.status === 'draft' ? paymentInstructions(paymentQuery.data || EMPTY_PAYMENT) : open.paymentDetails}
          items={items}
          onBack={() => showInvoice(null)}
          onStatus={onStatus}
          onDelete={onDelete}
          onSaveRecipient={onSaveRecipient}
          onSaveLine={onSaveLine}
          onAddLine={onAddLine}
          onRemoveLine={onRemoveLine}
          onRecordPayment={onRecordPayment}
          onRemovePayment={onRemovePayment}
        />
      </div>
    )
  }

  return (
    <div className="page page--invoicing">
      <PageHeader
        title="Invoicing"
        actions={(
          <button type="button" className="primary" onClick={() => { setChooserOpen(true); setClientQuery('') }}>
            + New Invoice
          </button>
        )}
      />

      <div className="section-card__stat-row">
        <Stat label="Total outstanding" value={formatGbpFromPence(outstandingPence)} />
        <Stat label="Drafts" value={String(draftCount)} />
        <Stat label="Paid" value={formatGbpFromPence(paidTotal)} />
      </div>

      <div className="invoice-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'invoices'} className={tab === 'invoices' ? 'invoice-tabs__tab invoice-tabs__tab--on' : 'invoice-tabs__tab'} onClick={() => setTab('invoices')}>
          All Invoices
        </button>
        <button type="button" role="tab" aria-selected={tab === 'unbilled'} className={tab === 'unbilled' ? 'invoice-tabs__tab invoice-tabs__tab--on' : 'invoice-tabs__tab'} onClick={() => setTab('unbilled')}>
          Unbilled Sessions
        </button>
      </div>

      {tab === 'invoices' ? (
        <section className="invoicing-panel">
          <div className="invoice-toolbar">
            <input value={invoiceQuery} onChange={(event) => setInvoiceQuery(event.target.value)} placeholder="Search invoices" aria-label="Search invoices" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="partial">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
          </div>
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Issue date</th>
                <th>Due date</th>
                <th>Status</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.length === 0 ? (
                <tr><td colSpan={7} className="invoice-table__empty">No invoices yet.</td></tr>
              ) : visibleInvoices.map((invoice) => {
                const display = invoiceDisplayStatus(invoice, today)
                return (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{invoice.forName && invoice.forName !== invoice.billToName ? `${invoice.billToName} · ${invoice.forName}` : invoice.billToName}</td>
                    <td>{invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : '—'}</td>
                    <td>{invoice.dueOn ? formatDisplayDate(invoice.dueOn) : '—'}</td>
                    <td><span className={statusClass(display)}>{STATUS_LABEL[display]}</span></td>
                    <td>{formatGbpFromPence(invoice.totalPence)}</td>
                    <td><button type="button" className="secondary" onClick={() => showInvoice(invoice.id)}>Open</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="invoicing-panel">
          <div className="invoice-toolbar">
            <input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="Search" aria-label="Search unbilled sessions" />
            <button
              type="button"
              className="primary"
              disabled={Boolean(creatingId) || selectedItems.length === 0}
              onClick={() => onCreateFor(selectedItems)}
            >
              Invoice selected
            </button>
          </div>
          <table className="invoice-table">
            <thead>
              <tr>
                <th className="invoice-table__check">
                  <input
                    type="checkbox"
                    aria-label="Select priced sessions"
                    checked={pricedUnbilled.length > 0 && selectedItems.length === pricedUnbilled.length}
                    onChange={() => {
                      const on = selectedItems.length !== pricedUnbilled.length
                      setSelected(on ? Object.fromEntries(pricedUnbilled.map((item) => [item.appointmentId, true])) : {})
                    }}
                  />
                </th>
                <th>Date</th>
                <th>Client</th>
                <th>Service</th>
                <th>Rate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {unbilled.length === 0 ? (
                <tr><td colSpan={6} className="invoice-table__empty">Nothing held is waiting to invoice.</td></tr>
              ) : unbilled.map((item) => (
                <tr key={item.appointmentId}>
                  <td className="invoice-table__check">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.clientName}`}
                      disabled={!item.hasFee}
                      checked={Boolean(selected[item.appointmentId])}
                      onChange={() => setSelected((current) => ({ ...current, [item.appointmentId]: !current[item.appointmentId] }))}
                    />
                  </td>
                  <td>{item.sessionDate ? formatDisplayDate(item.sessionDate) : '—'}</td>
                  <td>{item.clientName}</td>
                  <td>{item.serviceName}</td>
                  <td>
                    {item.hasFee
                      ? formatGbpFromPence(item.line.unitPence)
                      : (
                        <button type="button" className="invoice-fee-pill" onClick={() => { setFeeItem(item); setFeeAmount('') }}>
                          No fee set · Set fee
                        </button>
                      )}
                  </td>
                  <td>
                    {item.hasFee && (
                      <button type="button" className="secondary" disabled={Boolean(creatingId)} onClick={() => onCreateFor([item])}>
                        Create invoice
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {chooserOpen && (
        <FormOverlay title="New invoice" onClose={() => setChooserOpen(false)} size="sm">
          <label className="invoice-picker__find">
            Find a client
            <input value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Name" />
          </label>
          {clientChoices.length === 0 ? <p className="text-muted">No client with that name.</p> : (
            <ul className="invoice-picker__list">
              {clientChoices.map((client) => (
                <li key={client.id}>
                  <button type="button" className="secondary" disabled={Boolean(creatingId)} onClick={() => onStartBlank(client.id)}>
                    {client.real_name || 'Client'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FormOverlay>
      )}

      {feeItem && (
        <FormOverlay
          title="Set fee"
          meta={`${feeItem.clientName} · ${feeItem.sessionDate ? formatDisplayDate(feeItem.sessionDate) : ''}`}
          onClose={() => setFeeItem(null)}
          size="sm"
          footer={<button type="submit" form="invoice-set-fee" className="primary" disabled={Boolean(creatingId)}>Save fee</button>}
        >
          <form id="invoice-set-fee" className="invoice-dialog-form" onSubmit={onSetFee}>
            <label>
              This session (£)
              <input value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} inputMode="decimal" placeholder="80.00" />
            </label>
          </form>
        </FormOverlay>
      )}
    </div>
  )
}

function statusClass(display) {
  if (display === 'paid') return 'badge badge-green'
  if (display === 'draft') return 'badge badge-blue'
  if (display === 'overdue') return 'badge badge-grey'
  return 'badge badge-blue'
}

function Stat({ label, value }) {
  return (
    <div className="section-card__stat">
      <span className="section-card__stat-value">{value}</span>
      <span className="section-card__stat-label">{label}</span>
    </div>
  )
}

function toReportAppointment(appointment, serviceById, client) {
  const service = serviceById.get(appointment.service_id) || null
  const price = sessionBasePence({
    feePence: service?.fee_pence ?? null,
    overridePence: appointment.fee_override_pence ?? null,
    concession: concessionFromClient(client),
  })
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
    feePence: price.pence,
    overridePence: appointment.fee_override_pence ?? null,
    priceNote: price.phrase,
    feeIncludesVat: Boolean(service?.fee_includes_vat),
  }
}
