import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
import { useAppSession } from '../../lib/AppSessionContext'
import { useClientsQuery } from '../../lib/queries'
import { useAllAppointmentsQuery } from '../../lib/appointmentQueries'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import { formatGbpFromPence } from '../../lib/money'
import { loadCancellationPolicy } from '../../lib/supabase/cancellationPolicyRepo'
import { listServices } from '../../lib/supabase/servicesRepo'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'
import { loadClinicianPrintIdentity, preferredLetterhead, printLetterheadFromRow } from '../../lib/letterheadPrint'
import { DEFAULT_CANCELLATION_POLICY } from '../../lib/cancellationPolicy'
import { calendarMonthRange, inDateRange, matchesClientTag } from '../../lib/reporting'
import { getSupabase } from '../../lib/supabase/client'
import { listTags } from '../../lib/supabase/screenerRepo'
import {
  activeBilledAppointmentIds,
  activityLineForInvoice,
  batchInvoiceGroups,
  EMPTY_PAYMENT,
  invoiceBalancePence,
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
  recordInvoicePayment,
  removeInvoiceLine,
  removeInvoicePayment,
  setInvoiceStatus,
  updateInvoiceLine,
  updateInvoiceRecipient,
} from '../../lib/supabase/invoicesRepo'
import InvoiceSheet from './InvoiceSheet'

const EMPTY_LIST = []

export default function InvoicingPage() {
  const { session } = useAppSession()
  const userId = session?.user?.id
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const openId = params.get('invoice')
  const today = todayYmd()
  const [creatingId, setCreatingId] = useState('')
  const [composing, setComposing] = useState(false)
  const [draftClientId, setDraftClientId] = useState('')
  const [billToName, setBillToName] = useState('')
  const [billToEmail, setBillToEmail] = useState('')
  const [range, setRange] = useState(() => calendarMonthRange(todayYmd()))
  const [include, setInclude] = useState('both')
  const [serviceId, setServiceId] = useState('')
  const [tagId, setTagId] = useState('')
  const [batchMode, setBatchMode] = useState('client')
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
  const tagsQuery = useQuery({
    queryKey: ['tags', 'client'],
    queryFn: () => listTags('client'),
    enabled: Boolean(userId),
  })
  const linksQuery = useQuery({
    queryKey: ['client-tag-links'],
    queryFn: listClientTagLinks,
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
  const tags = tagsQuery.data || EMPTY_LIST
  const tagsByClient = useMemo(() => {
    const map = new Map()
    for (const link of linksQuery.data || []) {
      const list = map.get(link.client_id) || []
      list.push(link.tag_id)
      map.set(link.client_id, list)
    }
    return map
  }, [linksQuery.data])
  const contactsByClient = useMemo(() => {
    const map = new Map()
    for (const contact of contactsQuery.data || []) {
      const list = map.get(contact.clientId) || []
      list.push(contact)
      map.set(contact.clientId, list)
    }
    return map
  }, [contactsQuery.data])

  const work = useMemo(() => {
    const billed = activeBilledAppointmentIds(invoices)
    const sessions = []
    const activities = []
    for (const appointment of appointmentsQuery.data || []) {
      const report = toReportAppointment(appointment, serviceById)
      if (report.externalBusy || billed.has(report.id)) continue
      const activity = activityLineForInvoice(report)
      if (activity) {
        activities.push({
          appointmentId: report.id,
          clientId: report.clientId,
          sessionDate: report.sessionDate,
          line: activity,
        })
        continue
      }
      const line = lineForInvoice(report, policy, 'both')
      if (!line || !report.clientId) continue
      const client = clients.find((item) => item.id === report.clientId)
      const recipient = invoiceRecipient({
        clientName: client?.real_name || report.clientName || 'Client',
        clientEmail: client?.email || '',
        contacts: contactsByClient.get(report.clientId) || [],
      })
      sessions.push({
        appointmentId: report.id,
        clientId: report.clientId,
        clientName: client?.real_name || report.clientName || 'Client',
        serviceId: report.serviceId,
        sessionDate: report.sessionDate,
        marked: Boolean(report.attendance),
        billToName: recipient.billToName,
        billToEmail: recipient.billToEmail,
        line,
      })
    }
    return { sessions, activities }
  }, [appointmentsQuery.data, serviceById, invoices, policy, clients, contactsByClient])

  const batchRows = work.sessions.filter((item) => {
    if (!inDateRange(item.sessionDate, range)) return false
    if (serviceId && item.serviceId !== serviceId) return false
    if (include === 'held' && !item.marked) return false
    if (include === 'booked' && item.marked) return false
    return matchesClientTag(item.clientId, tagId, tagsByClient)
  })
  const groups = batchInvoiceGroups(batchRows.map((item) => ({
    clientId: item.clientId,
    clientName: item.clientName,
    billToName: item.billToName,
    billToEmail: item.billToEmail,
    line: item.line,
  })), batchMode)

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

  function tickedLines(group) {
    return group.lines.filter((line) => line.appointmentId && !unticked[line.appointmentId])
  }

  const tickedCount = groups.reduce((sum, group) => sum + tickedLines(group).length, 0)
  const toInvoicePence = groups.reduce((sum, group) => sum + invoiceTotalPence(tickedLines(group)), 0)
  const draftCount = invoices.filter((invoice) => invoice.status === 'draft').length
  const outstandingPence = invoices
    .filter((invoice) => invoice.status === 'issued')
    .reduce((sum, invoice) => sum + invoiceBalancePence(invoice), 0)

  function showInvoice(id) {
    const next = new URLSearchParams()
    if (id) next.set('invoice', id)
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

  function chooseClient(clientId) {
    setDraftClientId(clientId)
    const recipient = clientId ? recipientFor(clientId) : { billToName: '', billToEmail: '' }
    setBillToName(recipient.billToName)
    setBillToEmail(recipient.billToEmail)
  }

  async function onCreateBlank(event) {
    event.preventDefault()
    if (!draftClientId) {
      toast.error('Choose a client.')
      return
    }
    const client = clients.find((item) => item.id === draftClientId)
    setCreatingId('new')
    try {
      const invoice = await createInvoice({
        clientId: draftClientId,
        billToName: billToName,
        billToEmail: billToEmail,
        forName: client?.real_name || '',
        lines: [],
      })
      remember(invoice)
      setComposing(false)
      showInvoice(invoice.id)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoice')
    } finally {
      setCreatingId('')
    }
  }

  async function onCreateBatches(onlyKey) {
    const ticked = batchRows.filter((item) => item.appointmentId && !unticked[item.appointmentId])
    const ready = batchInvoiceGroups(ticked.map((item) => ({
      clientId: item.clientId,
      clientName: item.clientName,
      billToName: item.billToName,
      billToEmail: item.billToEmail,
      line: item.line,
    })), batchMode).filter((group) => !onlyKey || group.key === onlyKey)
    if (!ready.length) {
      toast.error('Tick at least one row.')
      return
    }
    setCreatingId(onlyKey || 'all')
    try {
      let last = null
      for (const group of ready) {
        const lines = group.clientId ? group.lines : group.lines.map((line) => {
          const source = ticked.find((item) => item.appointmentId === line.appointmentId)
          return source ? { ...line, description: `${source.clientName} — ${line.description}` } : line
        })
        last = await createInvoice({
          clientId: group.clientId,
          billToName: group.billToName,
          billToEmail: group.billToEmail,
          forName: group.forName,
          lines,
        })
        remember(last)
      }
      if (ready.length === 1 && last) showInvoice(last.id)
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

  const rows = invoices.map((invoice) => ({
    id: invoice.id,
    filterValues: {
      number: invoice.number,
      client: invoice.billToName,
      status: invoiceStatusLabel(invoice, today),
    },
    sortValues: {
      number: invoice.number,
      client: invoice.billToName,
      status: invoiceStatusLabel(invoice, today),
      issued: invoice.issuedOn || '',
      total: invoice.totalPence,
      balance: invoiceBalancePence(invoice),
    },
    cells: {
      number: invoice.number,
      client: invoice.billToName,
      status: invoiceStatusLabel(invoice, today),
      issued: invoice.issuedOn ? formatDisplayDate(invoice.issuedOn) : '—',
      total: formatGbpFromPence(invoice.totalPence),
      balance: formatGbpFromPence(invoiceBalancePence(invoice)),
    },
  }))

  if (openId && !open) {
    return (
      <div className="page page--invoicing">
        <PageHeader title="Invoicing" subtitle="This invoice is still loading, or it is not on this account." />
        {invoicesQuery.isLoading ? <p className="text-muted">Loading invoice…</p> : (
          <button type="button" className="secondary" onClick={() => showInvoice(null)}>All invoices</button>
        )}
      </div>
    )
  }

  return (
    <div className="page page--invoicing">
      <PageHeader
        className={open ? 'invoicing-no-print' : ''}
        title="Invoicing"
        subtitle="Start a draft for a client, add the lines you want, then print it. Payment details are in Account settings."
        actions={open ? null : (
          <button type="button" className="primary" onClick={() => { setComposing(true); chooseClient('') }}>
            New invoice
          </button>
        )}
      />

      {open ? (
        <InvoiceSheet
          invoice={open}
          today={today}
          letterhead={letterhead}
          paymentText={open.status === 'draft' ? paymentInstructions(paymentQuery.data || EMPTY_PAYMENT) : open.paymentDetails}
          candidates={work.sessions}
          activities={work.activities}
          services={services}
          tags={tags}
          tagsByClient={tagsByClient}
          onBack={() => showInvoice(null)}
          onStatus={onStatus}
          onSaveRecipient={onSaveRecipient}
          onSaveLine={onSaveLine}
          onAddLine={onAddLine}
          onRemoveLine={onRemoveLine}
          onRecordPayment={onRecordPayment}
          onRemovePayment={onRemovePayment}
        />
      ) : (
        <>
          {composing && (
            <form className="invoicing-add-line" onSubmit={onCreateBlank}>
              <h2 className="invoicing-block__title">New invoice</h2>
              <p className="text-muted">The draft can start empty. Bill-to begins with the client, or with the contact marked Send invoices to. Change it here and the saved contact stays as it is.</p>
              <label>
                Client
                <select value={draftClientId} onChange={(event) => chooseClient(event.target.value)}>
                  <option value="">Choose a client</option>
                  {[...clients].sort((a, b) => (a.real_name || '').localeCompare(b.real_name || '')).map((client) => (
                    <option key={client.id} value={client.id}>{client.real_name || 'Client'}</option>
                  ))}
                </select>
              </label>
              <label>
                Bill to
                <input value={billToName} onChange={(event) => setBillToName(event.target.value)} />
              </label>
              <label>
                Email
                <input value={billToEmail} onChange={(event) => setBillToEmail(event.target.value)} placeholder="No email yet" />
              </label>
              <div className="invoicing-add-line__actions">
                <button type="submit" className="primary" disabled={Boolean(creatingId)}>Create draft</button>
                <button type="button" className="secondary" onClick={() => setComposing(false)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="section-card__stat-row">
            <Stat label="To invoice" value={formatGbpFromPence(toInvoicePence)} detail="Ticked rows in these dates" />
            <Stat label="Drafts" value={draftCount} />
            <Stat label="Outstanding" value={formatGbpFromPence(outstandingPence)} detail="Sent, still to pay" />
          </div>

          <section className="invoicing-block">
            <h2 className="invoicing-block__title">Invoices</h2>
            <RecordTable
              columns={[
                { key: 'number', label: 'Number', filter: 'text', sort: 'text' },
                { key: 'client', label: 'To', filter: 'text', sort: 'text' },
                { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
                { key: 'issued', label: 'Issued', sort: 'text' },
                { key: 'total', label: 'Total', sort: 'number' },
                { key: 'balance', label: 'Balance', sort: 'number' },
              ]}
              rows={rows}
              onRowClick={(row) => showInvoice(row.id)}
              countNoun="invoices"
              emptyMessage="No invoices yet. New invoice starts a draft with no sessions."
            />
          </section>

          <section className="invoicing-block">
            <div className="invoicing-ready__head">
              <h2 className="invoicing-block__title">Uninvoiced sessions</h2>
              <button
                type="button"
                className="primary"
                disabled={Boolean(creatingId) || tickedCount === 0}
                onClick={() => onCreateBatches()}
              >
                Create invoices
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
                  <option value="both">Held and booked</option>
                  <option value="held">Held sessions</option>
                  <option value="booked">Booked sessions</option>
                </select>
              </label>
              <label className="invoicing-filters__field">
                Service
                <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setUnticked({}) }}>
                  <option value="">All services</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label className="invoicing-filters__field">
                Tag
                <select value={tagId} onChange={(event) => { setTagId(event.target.value); setUnticked({}) }}>
                  <option value="">All tags</option>
                  {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
              <label className="invoicing-filters__field">
                Group
                <select value={batchMode} onChange={(event) => setBatchMode(event.target.value)}>
                  <option value="client">One invoice per client</option>
                  <option value="payer">One invoice per payer</option>
                </select>
              </label>
            </div>
            <p className="text-muted">Tick the rows, then create invoices. Held sessions use the fee already stored. Booked sessions use the service price. One invoice per payer puts clients who share a billing contact on the same invoice.</p>
            {groups.length === 0 ? (
              <p className="text-muted">Nothing matches these filters. New invoice still starts a draft, and you can add a line there.</p>
            ) : groups.map((group) => (
              <article key={group.key} className="invoicing-ready">
                <div className="invoicing-ready__head">
                  <div>
                    <h3>{group.billToName}</h3>
                    <p>
                      {tickedLines(group).length} of {group.lines.length} ticked · {formatGbpFromPence(invoiceTotalPence(tickedLines(group)))}
                    </p>
                    <p>{group.forName && group.forName !== group.billToName ? `For ${group.forName}. ` : ''}{group.billToEmail ? group.billToEmail : 'No email yet.'}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={Boolean(creatingId) || tickedLines(group).length === 0}
                    onClick={() => onCreateBatches(group.key)}
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
                        <span>
                          {!group.clientId
                            ? `${batchRows.find((item) => item.appointmentId === line.appointmentId)?.clientName || ''} · `
                            : ''}
                          {line.description}{line.includesVat ? ' · incl. VAT' : ''}
                        </span>
                      </label>
                      <span>{formatGbpFromPence(line.unitPence)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </>
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

async function listClientTagLinks() {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.from('client_tag_links').select('client_id, tag_id')
  if (error) throw error
  return data || []
}
