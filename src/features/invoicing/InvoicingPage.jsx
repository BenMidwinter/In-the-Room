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
import { matchesClientTag, roleOf } from '../../lib/reporting'
import { concessionFromClient, sessionBasePence } from '../../lib/sessionPrice'
import { getSupabase } from '../../lib/supabase/client'
import { listTags } from '../../lib/supabase/screenerRepo'
import {
  activeBilledAppointmentIds,
  activityLineForInvoice,
  EMPTY_PAYMENT,
  invoiceBalancePence,
  invoiceRecipient,
  lineAmountPence,
  invoiceStatusLabel,
  invoiceTotalPence,
  lineForInvoice,
  paymentInstructions,
  readyInvoiceGroups,
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
import InvoiceSheet, { InvoiceDocument } from './InvoiceSheet'

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
  const [range, setRange] = useState({ from: '', to: '' })
  const [includeUnheld, setIncludeUnheld] = useState(false)
  const [find, setFind] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [tagId, setTagId] = useState('')
  const [unticked, setUnticked] = useState({})
  const [expanded, setExpanded] = useState({})
  const [showClients, setShowClients] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const [printInvoices, setPrintInvoices] = useState([])

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
    const unpriced = []
    for (const appointment of appointmentsQuery.data || []) {
      const client = clients.find((item) => item.id === appointment.client_id)
      const report = toReportAppointment(appointment, serviceById, client)
      if (report.externalBusy || billed.has(report.id)) continue
      const role = roleOf(report)
      if (role === 'support' || role === 'admin') {
        const priced = lineForInvoice(report, policy, 'both')
        if (priced) {
          const recipient = report.clientId
            ? invoiceRecipient({
              clientName: client?.real_name || report.clientName || 'Client',
              clientEmail: client?.email || '',
              contacts: contactsByClient.get(report.clientId) || [],
            })
            : { billToName: 'Practice', billToEmail: '', billedToContact: false }
          sessions.push({
            appointmentId: report.id,
            clientId: report.clientId,
            clientName: report.clientId ? (client?.real_name || report.clientName || 'Client') : 'Practice',
            serviceId: report.serviceId,
            serviceName: report.serviceName,
            sessionDate: report.sessionDate,
            marked: false,
            pricedActivity: true,
            billToName: recipient.billToName,
            billToEmail: recipient.billToEmail,
            billedToContact: Boolean(recipient.billedToContact),
            line: priced,
          })
        } else if (report.overridePence == null && report.feePence == null) {
          const activity = activityLineForInvoice(report)
          if (activity) {
            activities.push({
              appointmentId: report.id,
              clientId: report.clientId,
              sessionDate: report.sessionDate,
              line: activity,
            })
          }
          unpriced.push({
            appointmentId: report.id,
            clientId: report.clientId,
            clientName: report.clientId ? (client?.real_name || report.clientName || 'Client') : 'Practice',
            serviceId: report.serviceId,
            serviceName: report.serviceName || 'Support',
            sessionDate: report.sessionDate,
            marked: true,
          })
        }
        continue
      }
      const line = lineForInvoice(report, policy, 'both')
      if (!line || !report.clientId) {
        if (report.clientId && !report.doNotInvoice) {
          unpriced.push({
            appointmentId: report.id,
            clientId: report.clientId,
            clientName: client?.real_name || report.clientName || 'Client',
            serviceId: report.serviceId,
            serviceName: report.serviceName || 'Session',
            sessionDate: report.sessionDate,
            marked: Boolean(report.attendance),
          })
        }
        continue
      }
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
        serviceName: report.serviceName,
        sessionDate: report.sessionDate,
        marked: Boolean(report.attendance),
        pricedActivity: false,
        billToName: recipient.billToName,
        billToEmail: recipient.billToEmail,
        billedToContact: Boolean(recipient.billedToContact),
        line,
      })
    }
    return { sessions, activities, unpriced }
  }, [appointmentsQuery.data, serviceById, invoices, policy, clients, contactsByClient])

  const filteredSessions = work.sessions.filter((item) => (
    inChosenDates(item.sessionDate, range)
    && (!serviceId || item.serviceId === serviceId)
    && matchesClientTag(item.clientId, tagId, tagsByClient)
  ))
  const groups = readyInvoiceGroups(filteredSessions, { includeUnheld })
  const query = find.trim().toLowerCase()
  const shown = query
    ? groups.filter((group) => `${group.billToName} ${group.forName} ${group.billToEmail}`.toLowerCase().includes(query))
    : groups
  const unpricedShown = work.unpriced.filter((item) => (
    inChosenDates(item.sessionDate, range)
    && (!serviceId || item.serviceId === serviceId)
    && matchesClientTag(item.clientId, tagId, tagsByClient)
    && (item.marked || includeUnheld)
    && (!query || `${item.clientName} ${item.serviceName}`.toLowerCase().includes(query))
  ))

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

  const tickedCount = shown.reduce((sum, group) => sum + tickedLines(group).length, 0)
  const toInvoicePence = shown.reduce((sum, group) => sum + invoiceTotalPence(tickedLines(group)), 0)
  const draftCount = invoices.filter((invoice) => invoice.status === 'draft').length
  const outstandingPence = invoices
    .filter((invoice) => invoice.status === 'issued')
    .reduce((sum, invoice) => sum + invoiceBalancePence(invoice), 0)

  function showInvoice(id) {
    if (id) setPrintInvoices([])
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

  function selectedGroups() {
    const ids = new Set()
    for (const group of shown) {
      for (const line of tickedLines(group)) ids.add(line.appointmentId)
    }
    const rows = filteredSessions.filter((row) => ids.has(row.appointmentId))
    return readyInvoiceGroups(rows, { includeUnheld: true })
  }

  function invoiceInputFromGroup(group) {
    const names = group.forName.split(', ').filter(Boolean)
    const lines = names.length > 1
      ? group.lines.map((line) => {
        const source = filteredSessions.find((item) => item.appointmentId === line.appointmentId)
        return source ? { ...line, description: `${source.clientName} — ${line.description}` } : line
      })
      : group.lines
    return {
      clientId: group.clientId,
      billToName: group.billToName,
      billToEmail: group.billToEmail,
      forName: group.forName,
      lines,
    }
  }

  function toggleGroup(group, on) {
    setUnticked((current) => {
      const next = { ...current }
      for (const line of group.lines) {
        if (!line.appointmentId) continue
        if (on) delete next[line.appointmentId]
        else next[line.appointmentId] = true
      }
      return next
    })
  }

  async function onStartDraft(clientId) {
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
      showInvoice(invoice.id)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoice')
    } finally {
      setCreatingId('')
    }
  }

  async function onCreateDrafts(onlyKey) {
    const ready = selectedGroups().filter((group) => !onlyKey || group.key === onlyKey)
    if (!ready.length) {
      toast.error('Tick at least one row.')
      return
    }
    setCreatingId(onlyKey || 'drafts')
    try {
      let last = null
      for (const group of ready) {
        last = await createInvoice(invoiceInputFromGroup(group))
        remember(last)
      }
      if (ready.length === 1 && last) showInvoice(last.id)
      else toast.success(`Created ${ready.length} drafts`)
    } catch (err) {
      toast.error(err?.message || 'Could not create the invoices')
    } finally {
      setCreatingId('')
    }
  }

  async function onCreateAndSend() {
    const ready = selectedGroups()
    if (!ready.length) {
      toast.error('Tick at least one row.')
      return
    }
    const total = ready.reduce((sum, group) => sum + invoiceTotalPence(group.lines), 0)
    const noun = ready.length === 1 ? 'invoice' : 'invoices'
    const ok = await confirm({
      title: `Send ${ready.length} ${noun}?`,
      message: `${formatGbpFromPence(total)} will be marked as sent. You can print them together afterwards.`,
      confirmLabel: 'Create and send',
    })
    if (!ok) return
    const details = await loadPaymentDetails()
    if (!paymentInstructions(details).trim()) {
      toast.error('Add payment details in Account settings before you send these.')
      return
    }
    setCreatingId('send')
    const sent = []
    const failed = []
    try {
      for (const group of ready) {
        try {
          const draft = await createInvoice(invoiceInputFromGroup(group))
          const issued = await setInvoiceStatus(draft.id, 'issued')
          remember(issued)
          sent.push(issued)
        } catch {
          failed.push(group.billToName || group.forName)
        }
      }
      if (sent.length) {
        setPrintInvoices(sent)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.print())
        })
      }
      if (failed.length) toast.error(`Sent ${sent.length}. Could not send ${failed.join(', ')}.`)
      else toast.success(`Sent ${sent.length} ${sent.length === 1 ? 'invoice' : 'invoices'}`)
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

  const clientChoices = [...clients]
    .filter((client) => {
      const name = String(client.real_name || '').toLowerCase()
      return !clientQuery.trim() || name.includes(clientQuery.trim().toLowerCase())
    })
    .sort((a, b) => String(a.real_name || '').localeCompare(String(b.real_name || '')))

  return (
    <div className={`page page--invoicing${printInvoices.length && !open ? ' page--print-batch' : ''}`}>
      <PageHeader
        className={open ? 'invoicing-no-print' : ''}
        title="Invoicing"
        subtitle="Tick who to include, then create the invoices and mark them sent. Open one first if you want to change it."
        actions={open ? null : (
          <>
            <button type="button" className="secondary" disabled={Boolean(creatingId) || tickedCount === 0} onClick={() => onCreateDrafts()}>
              Create drafts
            </button>
            <button type="button" className="primary" disabled={Boolean(creatingId) || tickedCount === 0} onClick={onCreateAndSend}>
              {creatingId === 'send' ? 'Sending…' : 'Create and send'}
            </button>
          </>
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
        <div className="invoicing-screen">
          <div className="section-card__stat-row">
            <Stat label="To send" value={formatGbpFromPence(toInvoicePence)} detail={tickedCount ? `${shown.length} ${shown.length === 1 ? 'invoice' : 'invoices'} ticked` : 'Tick the rows to include'} />
            <Stat label="Drafts" value={draftCount} />
            <Stat label="Outstanding" value={formatGbpFromPence(outstandingPence)} detail="Sent, still to pay" />
          </div>

          {printInvoices.length > 0 && (
            <p className="invoicing-sent-note">
              {printInvoices.length} {printInvoices.length === 1 ? 'invoice is' : 'invoices are'} marked as sent.
              <button type="button" className="secondary" onClick={() => window.print()}>Print</button>
            </p>
          )}

          <section className="invoicing-block">
            <h2 className="invoicing-block__title">Ready to invoice</h2>
            <div className="invoicing-filters">
              <label className="invoicing-filters__field">
                From
                <input type="date" value={range.from} onChange={(event) => { setRange((current) => ({ ...current, from: event.target.value })); setUnticked({}) }} />
              </label>
              <label className="invoicing-filters__field">
                To
                <input type="date" value={range.to} onChange={(event) => { setRange((current) => ({ ...current, to: event.target.value })); setUnticked({}) }} />
              </label>
              <label className="invoicing-filters__field">
                Find
                <input value={find} onChange={(event) => setFind(event.target.value)} placeholder="Name" />
              </label>
              <label className="invoicing-filters__check">
                <input
                  type="checkbox"
                  checked={includeUnheld}
                  onChange={(event) => { setIncludeUnheld(event.target.checked); setUnticked({}) }}
                />
                Include sessions not yet held
              </label>
              {services.length > 1 && (
                <label className="invoicing-filters__field">
                  Service
                  <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setUnticked({}) }}>
                    <option value="">All services</option>
                    {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                  </select>
                </label>
              )}
              {tags.length > 0 && (
                <label className="invoicing-filters__field">
                  Tag
                  <select value={tagId} onChange={(event) => { setTagId(event.target.value); setUnticked({}) }}>
                    <option value="">All tags</option>
                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <p className="text-muted">Everyone with a fee is ticked. Held sessions use the fee already stored. A booking uses the service price, after any concession or a custom price on that session. People who share a Send invoices to contact go on one invoice. Leave the dates empty to see everything still outstanding.</p>
            {shown.length === 0 ? (
              <p className="text-muted">Nothing is waiting. Change the dates, or include sessions not yet held. You can still start an invoice for one client.</p>
            ) : shown.map((group) => {
              const ticked = tickedLines(group)
              const allOn = ticked.length === group.lines.length && group.lines.length > 0
              return (
                <article key={group.key} className="invoicing-ready">
                  <div className="invoicing-ready__head">
                    <label className="invoicing-ready__tick">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(node) => { if (node) node.indeterminate = ticked.length > 0 && !allOn }}
                        onChange={() => toggleGroup(group, !allOn)}
                      />
                      <span>
                        <h3>{group.billToName}</h3>
                        <p>
                          {ticked.length} of {group.lines.length} · {formatGbpFromPence(invoiceTotalPence(ticked))}
                        </p>
                        <p>{group.forName && group.forName !== group.billToName ? `For ${group.forName}. ` : ''}{group.billToEmail || 'No email yet.'}</p>
                      </span>
                    </label>
                    <div className="invoicing-sheet__actions">
                      <button type="button" className="secondary" onClick={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))}>
                        {expanded[group.key] ? 'Hide sessions' : 'Sessions'}
                      </button>
                      <button type="button" className="secondary" disabled={Boolean(creatingId) || ticked.length === 0} onClick={() => onCreateDrafts(group.key)}>
                        Draft
                      </button>
                    </div>
                  </div>
                  {expanded[group.key] && (
                    <ul className="invoicing-ready__lines">
                      {group.lines.map((line) => {
                        const source = filteredSessions.find((item) => item.appointmentId === line.appointmentId)
                        return (
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
                                {!group.clientId && source ? `${source.clientName} · ` : ''}
                                {line.description}{line.includesVat ? ' · incl. VAT' : ''}
                              </span>
                            </label>
                            <span>{formatGbpFromPence(lineAmountPence(line))}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </article>
              )
            })}
          </section>

          {unpricedShown.length > 0 && (
            <section className="invoicing-block">
              <h2 className="invoicing-block__title">No price</h2>
              <p className="text-muted">Left out of the send. Set a price on the service, or a custom price on the session.</p>
              <ul className="invoicing-ready__lines">
                {unpricedShown.map((item) => (
                  <li key={item.appointmentId}>
                    <span>{item.clientName} · {formatDisplayDate(item.sessionDate)} · {item.serviceName}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="invoicing-block">
            <div className="invoicing-ready__head">
              <h2 className="invoicing-block__title">Start an invoice</h2>
              <button type="button" className="secondary" onClick={() => setShowClients((current) => !current)}>
                {showClients ? 'Hide clients' : 'Choose a client'}
              </button>
            </div>
            {showClients && (
              <>
                <label className="invoicing-filters__field">
                  Find
                  <input value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Name" />
                </label>
                {clientChoices.length === 0 ? <p className="text-muted">No client with that name.</p> : (
                  <ul className="invoicing-client-list">
                    {clientChoices.map((client) => (
                      <li key={client.id}>
                        <button type="button" className="secondary" disabled={Boolean(creatingId)} onClick={() => onStartDraft(client.id)}>
                          {client.real_name || 'Client'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

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
              emptyMessage="No invoices yet."
            />
          </section>
        </div>
      )}
      {!open && printInvoices.length > 0 && (
        <div className="invoice-print-stack">
          {printInvoices.map((invoice) => (
            <InvoiceDocument
              key={invoice.id}
              invoice={invoice}
              today={today}
              letterhead={letterhead}
              paymentText={invoice.paymentDetails}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function inChosenDates(ymd, range) {
  if (!ymd) return false
  if (range.from && ymd < range.from) return false
  if (range.to && ymd > range.to) return false
  return true
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

async function listClientTagLinks() {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.from('client_tag_links').select('client_id, tag_id')
  if (error) throw error
  return data || []
}
