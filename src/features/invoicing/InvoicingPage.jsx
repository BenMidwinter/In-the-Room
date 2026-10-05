import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import FormOverlay from '../../components/FormOverlay'
import RecordTable from '../../components/RecordTable'
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
import BatchInvoiceWizard from './BatchInvoiceWizard'
import BulkDispatchModal from './BulkDispatchModal'

const EMPTY_LIST = []
const INVOICE_COLUMNS = [
  { key: 'number', label: 'Invoice', filter: 'text', sort: 'text' },
  { key: 'client', label: 'Client', filter: 'text', sort: 'text' },
  { key: 'issued', label: 'Issue date', sort: 'date', sortFirst: 'desc' },
  { key: 'due', label: 'Due date', sort: 'date' },
  { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
  { key: 'total', label: 'Total', sort: 'number' },
  { key: 'action', label: '', sort: false },
]
const UNBILLED_COLUMNS = [
  { key: 'date', label: 'Date', sort: 'date', sortFirst: 'desc' },
  { key: 'client', label: 'Client', filter: 'text', sort: 'text' },
  { key: 'service', label: 'Service', filter: 'choice', sort: 'text' },
  { key: 'rate', label: 'Rate', sort: 'number' },
  { key: 'action', label: '', sort: false },
]
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
  const [selected, setSelected] = useState({})
  const [pickedInvoices, setPickedInvoices] = useState({})
  const [batchOpen, setBatchOpen] = useState(false)
  const [dispatchState, setDispatchState] = useState(null)
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
        priceNote: report.priceNote || '',
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

  const unbilled = items.filter((item) => item.held)
  const pricedUnbilled = unbilled.filter((item) => item.hasFee)
  const selectedItems = pricedUnbilled.filter((item) => selected[item.appointmentId])
  const pickedInvoiceList = invoices.filter((invoice) => pickedInvoices[invoice.id])
  const invoiceRows = invoices.map((invoice) => {
    const display = invoiceDisplayStatus(invoice, today)
    const clientLabel = invoice.forName && invoice.forName !== invoice.billToName
      ? `${invoice.billToName} · ${invoice.forName}`
      : invoice.billToName
    return {
      id: invoice.id,
      muted: display === 'void',
      cells: {
        number: invoice.number,
        client: clientLabel,
        issued: invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : '—',
        due: invoice.dueOn ? formatDisplayDate(invoice.dueOn) : '—',
        status: <span className={statusClass(display)}>{STATUS_LABEL[display]}</span>,
        total: formatGbpFromPence(invoice.totalPence),
        action: (
          <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); showInvoice(invoice.id) }}>
            Open
          </button>
        ),
      },
      filterValues: { number: invoice.number, client: clientLabel, status: STATUS_LABEL[display] },
      sortValues: {
        number: invoice.number,
        client: clientLabel,
        issued: invoice.issuedOn || '',
        due: invoice.dueOn || '',
        status: STATUS_LABEL[display],
        total: invoice.totalPence,
      },
    }
  })
  const unbilledRows = unbilled.map((item) => ({
    id: item.appointmentId,
    hasFee: item.hasFee,
    cells: {
      date: item.sessionDate ? formatDisplayDate(item.sessionDate) : '—',
      client: item.clientName,
      service: item.serviceName,
      rate: item.hasFee
        ? formatGbpFromPence(item.line.unitPence)
        : (
          <button type="button" className="invoice-fee-pill" onClick={() => { setFeeItem(item); setFeeAmount('') }}>
            No fee set · Set fee
          </button>
        ),
      action: item.hasFee ? (
        <button type="button" className="secondary" disabled={Boolean(creatingId)} onClick={() => onCreateFor([item])}>
          Create invoice
        </button>
      ) : null,
    },
    filterValues: { client: item.clientName, service: item.serviceName },
    sortValues: {
      date: item.sessionDate || '',
      client: item.clientName,
      service: item.serviceName,
      rate: item.hasFee ? item.line.unitPence : null,
    },
  }))
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
    <div className={pickedInvoiceList.length > 0 && tab === 'invoices' ? 'page page--invoicing page--invoice-selecting' : 'page page--invoicing'}>
      <PageHeader
        title="Invoicing"
        actions={(
          <>
            <button type="button" className="secondary" onClick={() => setBatchOpen(true)}>Batch Invoice</button>
            <button type="button" className="primary" onClick={() => { setChooserOpen(true); setClientQuery('') }}>
              + New Invoice
            </button>
          </>
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
          <RecordTable
            columns={INVOICE_COLUMNS}
            rows={invoiceRows}
            countNoun="invoices"
            emptyMessage="No invoices yet."
            defaultSort={{ key: 'number', direction: 'desc' }}
            onRowClick={(row) => showInvoice(row.id)}
            selection={{
              isSelected: (row) => Boolean(pickedInvoices[row.id]),
              label: (row) => `Select ${row.sortValues.number}`,
              onToggle: (row) => setPickedInvoices((current) => toggleId(current, row.id)),
              onToggleVisible: (visible, next) => setPickedInvoices((current) => toggleVisible(current, visible, next)),
            }}
          />
        </section>
      ) : (
        <section className="invoicing-panel">
          {selectedItems.length > 0 && (
            <div className="invoice-toolbar">
              <button
                type="button"
                className="primary"
                disabled={Boolean(creatingId)}
                onClick={() => onCreateFor(selectedItems)}
              >
                Invoice selected
              </button>
            </div>
          )}
          <RecordTable
            columns={UNBILLED_COLUMNS}
            rows={unbilledRows}
            countNoun="sessions"
            emptyMessage="Nothing held is waiting to invoice."
            defaultSort={{ key: 'date', direction: 'desc' }}
            selection={{
              isSelected: (row) => Boolean(selected[row.id]),
              canSelect: (row) => row.hasFee,
              label: (row) => `Select ${row.sortValues.client}`,
              onToggle: (row) => setSelected((current) => toggleId(current, row.id)),
              onToggleVisible: (visible, next) => setSelected((current) => toggleVisible(current, visible, next)),
            }}
          />
        </section>
      )}

      {pickedInvoiceList.length > 0 && tab === 'invoices' && (
        <div className="invoice-selection-bar invoicing-no-print">
          <span>{pickedInvoiceList.length} {pickedInvoiceList.length === 1 ? 'invoice' : 'invoices'} selected</span>
          <button type="button" className="primary" onClick={() => setDispatchState({ invoices: pickedInvoiceList, preferManual: false })}>
            Send / Dispatch Invoices
          </button>
          <button type="button" className="secondary" onClick={() => setDispatchState({ invoices: pickedInvoiceList, preferManual: true })}>
            Mark as Sent (Manual)
          </button>
          <button type="button" className="secondary" onClick={() => setPickedInvoices({})}>Deselect All</button>
        </div>
      )}

      {batchOpen && (
        <BatchInvoiceWizard
          items={items}
          today={today}
          onGenerate={createDrafts}
          onClose={() => setBatchOpen(false)}
          onReview={() => { setBatchOpen(false); setTab('invoices') }}
          onDispatch={(created) => {
            setBatchOpen(false)
            setDispatchState({ invoices: created, preferManual: false })
          }}
        />
      )}

      {dispatchState && (
        <BulkDispatchModal
          invoices={dispatchState.invoices}
          preferManual={dispatchState.preferManual}
          onClose={() => setDispatchState(null)}
          onFinished={(result) => {
            queryClient.invalidateQueries({ queryKey: ['invoices', userId] })
            setPickedInvoices((current) => {
              const next = { ...current }
              for (const id of result.successfulIds) delete next[id]
              return next
            })
          }}
        />
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

function toggleId(current, id) {
  const next = { ...current }
  if (next[id]) delete next[id]
  else next[id] = true
  return next
}

function toggleVisible(current, visible, nextChecked) {
  const next = { ...current }
  for (const row of visible) {
    if (nextChecked) next[row.id] = true
    else delete next[row.id]
  }
  return next
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
