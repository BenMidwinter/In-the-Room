import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import RecordTable from '../../components/RecordTable'
import TagLabel from '../../components/TagLabel'
import { useAppSession } from '../../lib/AppSessionContext'
import { useClientsQuery } from '../../lib/queries'
import { useAllAppointmentsQuery } from '../../lib/appointmentQueries'
import { useProgressNoteIndexQuery } from '../../lib/progressNoteQueries'
import { usePracticeLogsQuery } from '../../lib/practiceLogQueries'
import { attendanceLabel } from '../../lib/appointmentUtils'
import { formatDisplayDate, todayYmd } from '../../lib/dateArchitecture'
import { formatGbpFromPence } from '../../lib/money'
import { loadCancellationPolicy } from '../../lib/supabase/cancellationPolicyRepo'
import { listAvailabilitySettings } from '../../lib/supabase/availabilityRepo'
import { listServices } from '../../lib/supabase/servicesRepo'
import { listTags, listScreenerBoard } from '../../lib/supabase/screenerRepo'
import { getSupabase } from '../../lib/supabase/client'
import { listExternalCalendarBlocks, externalBlocksAsAppointments } from '../../lib/supabase/calendarConnectionsRepo'
import {
  availabilityMinutes,
  averageWaitDays,
  efficiencyFromMinutes,
  formatHoursFromMinutes,
  formatPracticeHours,
  inDateRange,
  matchesClientTag,
  monthToDateRange,
  noteStateFor,
  practiceActivities,
  quarterToDateRange,
  rollingWeekRange,
  summariseAppointments,
  timeBuckets,
} from '../../lib/reporting'
import { activeBilledAppointmentIds, invoiceBalancePence } from '../../lib/invoices'
import { listInvoices } from '../../lib/supabase/invoicesRepo'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments & Notes' },
  { id: 'clients', label: 'Clients' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'practice', label: 'My Practice' },
  { id: 'finance', label: 'Finance' },
]

const FILTER_NOTE = {
  overview: 'Service narrows hours, fees, and notes. Efficiency uses the whole diary.',
  appointments: 'Filter by service, and by a client tag.',
  clients: 'Filter by a client tag. Service stays on the appointment sections.',
  waitlist: 'Filter by a waitlist tag, and by the appointment type they are waiting for.',
  practice: 'Service narrows the clinical rows. Filter the table by type, activity, or service. CPD and supervision stay in the list.',
  finance: 'Filter by service, and by a client tag.',
}

const NOTE_LABEL = { complete: 'Signed off', draft: 'Draft', missing: 'Missing' }
const EMPTY_LIST = []

export default function ReportingPage() {
  const { session } = useAppSession()
  const userId = session?.user?.id
  const today = todayYmd()
  const [section, setSection] = useState('overview')
  const [range, setRange] = useState(() => rollingWeekRange(todayYmd()))
  const [serviceId, setServiceId] = useState('')
  const [tagId, setTagId] = useState('')

  const appointmentsQuery = useAllAppointmentsQuery()
  const noteIndex = useProgressNoteIndexQuery(Boolean(userId))
  const clientsQuery = useClientsQuery({ userId })
  const cpdQuery = usePracticeLogsQuery('cpd', userId)
  const supervisionQuery = usePracticeLogsQuery('supervision', userId)
  const policyQuery = useQuery({
    queryKey: ['cancellation-policy', userId],
    queryFn: loadCancellationPolicy,
    enabled: Boolean(userId),
  })
  const availabilityQuery = useQuery({
    queryKey: ['availability', 'reporting'],
    queryFn: listAvailabilitySettings,
    enabled: Boolean(userId),
  })
  const servicesQuery = useQuery({
    queryKey: ['services', 'reporting'],
    queryFn: listServices,
    enabled: Boolean(userId),
  })
  const clientTagsQuery = useQuery({
    queryKey: ['tags', 'client'],
    queryFn: () => listTags('client'),
    enabled: Boolean(userId),
  })
  const waitlistTagsQuery = useQuery({
    queryKey: ['tags', 'waitlist'],
    queryFn: () => listTags('waitlist'),
    enabled: Boolean(userId),
  })
  const linksQuery = useQuery({
    queryKey: ['client-tag-links'],
    queryFn: listClientTagLinks,
    enabled: Boolean(userId),
  })
  const episodesQuery = useQuery({
    queryKey: ['episodes', 'reporting'],
    queryFn: listEpisodeDates,
    enabled: Boolean(userId),
  })
  const boardQuery = useQuery({
    queryKey: ['screener-board', 'reporting'],
    queryFn: () => listScreenerBoard().catch(() => []),
    enabled: Boolean(userId),
  })
  const invoicesQuery = useQuery({
    queryKey: ['invoices', userId],
    queryFn: () => listInvoices().catch(() => []),
    enabled: Boolean(userId),
  })
  const busyQuery = useQuery({
    queryKey: ['external-busy', 'reporting', range.from, range.to],
    queryFn: () => listExternalCalendarBlocks({
      fromIso: `${range.from}T00:00:00`,
      toIso: `${range.to}T23:59:59`,
    }),
    enabled: Boolean(userId),
  })

  const services = servicesQuery.data || EMPTY_LIST
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const tagsByClient = useMemo(() => {
    const map = new Map()
    for (const link of linksQuery.data || []) {
      const list = map.get(link.client_id) || []
      list.push(link.tag_id)
      map.set(link.client_id, list)
    }
    return map
  }, [linksQuery.data])
  const notesByAppointment = useMemo(() => {
    const grouped = new Map()
    for (const note of noteIndex.data || []) {
      if (!note?.appointment_id) continue
      const list = grouped.get(note.appointment_id) || []
      list.push(note)
      grouped.set(note.appointment_id, list)
    }
    const states = new Map()
    for (const [id, notes] of grouped) states.set(id, noteStateFor(notes))
    return states
  }, [noteIndex.data])

  const mapped = useMemo(() => {
    const own = (appointmentsQuery.data || []).map((appointment) => toReportAppointment(appointment, serviceById))
    const external = externalBlocksAsAppointments(busyQuery.data || [], userId || '').map((appointment) => ({
      ...toReportAppointment(appointment, serviceById),
      externalBusy: true,
      blockRole: 'busy',
    }))
    return [...own, ...external]
  }, [appointmentsQuery.data, busyQuery.data, serviceById, userId])

  const tagKind = section === 'waitlist' ? 'waitlist' : 'client'
  const tagOptions = tagKind === 'waitlist' ? (waitlistTagsQuery.data || []) : (clientTagsQuery.data || [])
  const showService = section !== 'clients'
  const showTag = section === 'appointments' || section === 'clients' || section === 'waitlist' || section === 'finance'
  const activeTag = showTag ? tagId : ''
  const activeService = showService && section !== 'practice' ? serviceId : ''

  const scoped = useMemo(
    () => mapped.filter((appointment) => (
      (!activeService || appointment.serviceId === activeService)
      && matchesClientTag(appointment.clientId, activeTag, tagsByClient)
    )),
    [mapped, activeService, activeTag, tagsByClient],
  )
  const summary = useMemo(
    () => summariseAppointments(scoped, range, notesByAppointment, policyQuery.data),
    [scoped, range, notesByAppointment, policyQuery.data],
  )
  const efficiency = useMemo(() => {
    const buckets = timeBuckets(mapped, range)
    return efficiencyFromMinutes({
      availability: availabilityMinutes(availabilityQuery.data || [], range),
      ...buckets,
    })
  }, [mapped, range, availabilityQuery.data])

  const choosePreset = (preset) => {
    if (preset === 'week') setRange(rollingWeekRange(today))
    if (preset === 'month') setRange(monthToDateRange(today))
    if (preset === 'quarter') setRange(quarterToDateRange(today))
  }

  const changeSection = (next) => {
    setSection(next)
    setTagId('')
  }

  return (
    <div className="page reporting-page">
      <PageHeader
        title="Reporting"
        subtitle="A rolling week, until you choose other dates."
      />

      <div className="reporting-filters">
        <div className="reporting-filters__presets">
          <button type="button" className="secondary" onClick={() => choosePreset('week')}>Rolling week</button>
          <button type="button" className="secondary" onClick={() => choosePreset('month')}>This month</button>
          <button type="button" className="secondary" onClick={() => choosePreset('quarter')}>This quarter</button>
        </div>
        <label className="reporting-filters__field">
          From
          <input
            className="paper-input"
            type="date"
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label className="reporting-filters__field">
          To
          <input
            className="paper-input"
            type="date"
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        {showService && (
          <label className="reporting-filters__field">
            Service
            <select className="paper-input" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              <option value="">All services</option>
              {services.filter((service) => service.is_active !== false).map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </label>
        )}
        {showTag && (
          <label className="reporting-filters__field">
            {tagKind === 'waitlist' ? 'Waitlist tag' : 'Client tag'}
            <select className="paper-input" value={tagId} onChange={(event) => setTagId(event.target.value)}>
              <option value="">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-muted reporting-note">{FILTER_NOTE[section]}</p>

      <div className="finance-tabs" role="tablist" aria-label="Reporting sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={`finance-tabs__btn${section === item.id ? ' finance-tabs__btn--active' : ''}`}
            onClick={() => changeSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <Overview summary={summary} efficiency={efficiency} />
      )}
      {section === 'appointments' && (
        <AppointmentsSection summary={summary} />
      )}
      {section === 'clients' && (
        <ClientsSection
          clients={clientsQuery.data || []}
          appointments={mapped}
          episodes={episodesQuery.data || []}
          range={range}
          tagId={tagId}
          tagsByClient={tagsByClient}
        />
      )}
      {section === 'waitlist' && (
        <WaitlistSection
          people={(boardQuery.data || []).filter((person) => person.status === 'waitlist')}
          tags={waitlistTagsQuery.data || []}
          services={services}
          range={range}
          tagId={tagId}
          serviceId={serviceId}
          today={today}
        />
      )}
      {section === 'practice' && (
        <PracticeSection
          cpd={cpdQuery.data || []}
          supervision={supervisionQuery.data || []}
          appointments={mapped}
          range={range}
          serviceId={serviceId}
        />
      )}
      {section === 'finance' && (
        <FinanceSection
          summary={summary}
          invoices={invoicesQuery.data || EMPTY_LIST}
          range={range}
        />
      )}
    </div>
  )
}

function Overview({ summary, efficiency }) {
  return (
    <div className="reporting-section">
      <div className="section-card__stat-row">
        <Stat label="Hours delivered" value={formatHoursFromMinutes(summary.deliveredMinutes)} detail="Attended sessions" />
        <Stat
          label="Sessions attended"
          value={summary.attended}
          detail={`${summary.dna} did not attend · ${summary.cancelled} cancelled`}
        />
        <Stat label="Fees" value={formatGbpFromPence(summary.earnedPence)} detail="Attended, cancelled, and DNA, after the policy" />
        <Stat label="Notes to finish" value={summary.notesToFinish} detail="Attended sessions without a signed Process Note" />
        <Stat
          label="Efficiency"
          value={efficiency.rate == null ? '—' : `${efficiency.rate}%`}
          detail={`${formatHoursFromMinutes(efficiency.used)} used · ${formatHoursFromMinutes(efficiency.open)} open`}
        />
      </div>
      <p className="text-muted reporting-note">
        Efficiency is appointment, support, and admin time as a percentage of availability minus busy time.
        Open time is what is left after that.
      </p>
      <table className="reporting-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Hours</th>
            <th>Attended</th>
            <th>Fees</th>
          </tr>
        </thead>
        <tbody>
          {summary.byService.length === 0 && (
            <tr><td colSpan={4}>Nothing in these dates.</td></tr>
          )}
          {summary.byService.map((row) => (
            <tr key={row.serviceId}>
              <td>{row.name}</td>
              <td>{formatHoursFromMinutes(row.minutes)}</td>
              <td>{row.sessions}</td>
              <td>{formatGbpFromPence(row.earnedPence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AppointmentsSection({ summary }) {
  const signed = summary.rows.filter((row) => row.attendance === 'attended' && row.note === 'complete').length
  const rows = summary.rows.map((row) => ({
    id: row.id,
    filterValues: {
      date: row.sessionDate,
      client: row.clientName,
      service: row.serviceName,
      attendance: attendanceLabel(row.attendance),
      note: row.attendance === 'attended' ? NOTE_LABEL[row.note] : '',
    },
    sortValues: {
      date: row.sessionDate,
      client: row.clientName,
      service: row.serviceName,
      attendance: attendanceLabel(row.attendance),
      note: row.note,
    },
    cells: {
      date: formatDisplayDate(row.sessionDate),
      client: row.clientName,
      service: row.serviceName,
      attendance: attendanceLabel(row.attendance),
      note: row.attendance === 'attended' ? NOTE_LABEL[row.note] : '—',
    },
  }))
  return (
    <div className="reporting-section">
      <p className="reporting-note">
        {signed} of {summary.attended} attended sessions have a signed Process Note.
      </p>
      <RecordTable
        columns={[
          { key: 'date', label: 'Date', sort: 'text' },
          { key: 'client', label: 'Client', filter: 'text' },
          { key: 'service', label: 'Service', filter: 'choice' },
          { key: 'attendance', label: 'Attendance', filter: 'choice' },
          { key: 'note', label: 'Process Note', filter: 'choice' },
        ]}
        rows={rows}
        countNoun="sessions"
        emptyMessage="No sessions in these dates."
      />
    </div>
  )
}

function ClientsSection({ clients, appointments, episodes, range, tagId, tagsByClient }) {
  const seen = new Map()
  for (const appointment of appointments) {
    if (appointment.externalBusy || appointment.blockRole === 'busy' || appointment.blockRole === 'support' || appointment.blockRole === 'admin') continue
    if (appointment.attendance === 'cancelled') continue
    if (!inDateRange(appointment.sessionDate, range)) continue
    if (!matchesClientTag(appointment.clientId, tagId, tagsByClient)) continue
    if (!appointment.clientId) continue
    const current = seen.get(appointment.clientId) || { sessions: 0, last: appointment.sessionDate }
    current.sessions += 1
    if (appointment.sessionDate > current.last) current.last = appointment.sessionDate
    seen.set(appointment.clientId, current)
  }
  const tagged = (client) => matchesClientTag(client.id, tagId, tagsByClient)
  const active = clients.filter((client) => client.status === 'active' && tagged(client))
  const newcomers = clients.filter((client) => (
    tagged(client)
    && client.status !== 'screener'
    && client.status !== 'waitlist'
    && client.status !== 'rejected'
    && inDateRange(String(client.created_at || '').slice(0, 10), range)
  ))
  const discharged = episodes.filter((episode) => (
    episode.status === 'discharged'
    && inDateRange(episode.end_date || '', range)
    && matchesClientTag(episode.client_id, tagId, tagsByClient)
  ))
  const byId = new Map(clients.map((client) => [client.id, client]))
  const rows = [...seen.entries()].map(([id, info]) => {
    const client = byId.get(id)
    const name = client?.real_name || 'Client'
    return {
      id,
      filterValues: { name },
      sortValues: { name, sessions: info.sessions, last: info.last },
      cells: {
        name,
        sessions: info.sessions,
        last: formatDisplayDate(info.last),
      },
    }
  })
  return (
    <div className="reporting-section">
      <div className="section-card__stat-row">
        <Stat label="Active now" value={active.length} />
        <Stat label="Seen in these dates" value={seen.size} />
        <Stat label="New in these dates" value={newcomers.length} />
        <Stat label="Courses discharged" value={discharged.length} />
      </div>
      <RecordTable
        columns={[
          { key: 'name', label: 'Client', filter: 'text' },
          { key: 'sessions', label: 'Sessions', sort: 'number' },
          { key: 'last', label: 'Latest', sort: 'text' },
        ]}
        rows={rows}
        countNoun="clients"
        emptyMessage="No clients seen in these dates."
      />
    </div>
  )
}

function WaitlistSection({ people, tags, services, range, tagId, serviceId, today }) {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const serviceById = new Map(services.map((service) => [service.id, service]))
  const matching = people.filter((person) => (
    (!tagId || (person.tagIds || []).includes(tagId))
    && (!serviceId || person.serviceId === serviceId)
  ))
  const joined = matching.filter((person) => inDateRange(String(person.createdAt || '').slice(0, 10), range))
  const average = averageWaitDays(matching.map((person) => person.createdAt), today)
  const rows = matching.map((person) => {
    const labels = (person.tagIds || []).map((id) => tagById.get(id)).filter(Boolean)
    const serviceName = serviceById.get(person.serviceId)?.name || '—'
    const days = averageWaitDays([person.createdAt], today)
    return {
      id: person.id,
      filterValues: { name: person.name, service: serviceName },
      sortValues: { name: person.name, days: days || 0, service: serviceName },
      cells: {
        name: person.name,
        days: days == null ? '—' : days,
        service: serviceName,
        tags: labels.length
          ? labels.map((tag) => <TagLabel key={tag.id} name={tag.name} color={tag.color} />)
          : '—',
      },
    }
  })
  return (
    <div className="reporting-section">
      <div className="section-card__stat-row">
        <Stat label="On the waitlist now" value={matching.length} />
        <Stat label="Joined in these dates" value={joined.length} />
        <Stat label="Average days waiting" value={average == null ? '—' : average} detail="People on the waitlist now" />
      </div>
      <RecordTable
        columns={[
          { key: 'name', label: 'Name', filter: 'text' },
          { key: 'days', label: 'Days waiting', sort: 'number' },
          { key: 'service', label: 'Appointment type', filter: 'choice' },
          { key: 'tags', label: 'Tags', sort: false },
        ]}
        rows={rows}
        countNoun="people"
        emptyMessage="Nobody on the waitlist matches this filter."
      />
    </div>
  )
}

function PracticeSection({ cpd, supervision, appointments, range, serviceId }) {
  const activities = practiceActivities(appointments, { cpd, supervision }, range, serviceId)
  const cpdMinutes = activities.filter((row) => row.kind === 'CPD').reduce((sum, row) => sum + row.minutes, 0)
  const supervisionRows = activities.filter((row) => row.kind.startsWith('Supervision'))
  const supervisionMinutes = supervisionRows.reduce((sum, row) => sum + row.minutes, 0)
  const received = supervisionRows.filter((row) => row.kind === 'Supervision received').reduce((sum, row) => sum + row.minutes, 0)
  const delivered = supervisionRows.filter((row) => row.kind === 'Supervision delivered').reduce((sum, row) => sum + row.minutes, 0)
  const clinical = activities.filter((row) => row.kind === 'Clinical').reduce((sum, row) => sum + row.minutes, 0)
  const rows = activities.map((row) => ({
    id: row.id,
    filterValues: {
      kind: row.kind,
      activity: row.activity,
      service: row.service,
    },
    sortValues: {
      date: row.date,
      kind: row.kind,
      activity: row.activity,
      service: row.service,
      hours: row.minutes,
    },
    cells: {
      date: formatDisplayDate(row.date),
      kind: row.kind,
      activity: row.activity,
      service: row.service,
      hours: formatPracticeHours(row.minutes),
    },
  }))
  return (
    <div className="reporting-section">
      <div className="section-card__stat-row">
        <Stat label="Clinical hours" value={formatHoursFromMinutes(clinical)} detail="Attended appointments" />
        <Stat label="CPD" value={formatHoursFromMinutes(cpdMinutes)} />
        <Stat
          label="Supervision"
          value={formatHoursFromMinutes(supervisionMinutes)}
          detail={`${formatHoursFromMinutes(received)} received · ${formatHoursFromMinutes(delivered)} delivered`}
        />
      </div>
      <RecordTable
        columns={[
          { key: 'date', label: 'Date', sort: 'date' },
          { key: 'kind', label: 'Type', filter: 'choice', sort: 'text' },
          { key: 'activity', label: 'Activity', filter: 'text', sort: 'text' },
          { key: 'service', label: 'Service', filter: 'choice', sort: 'text' },
          { key: 'hours', label: 'Hours', sort: 'number' },
        ]}
        rows={rows}
        defaultSort={{ key: 'date', direction: 'desc' }}
        countNoun="entries"
        emptyMessage="No clinical hours, CPD, or supervision in these dates."
      />
    </div>
  )
}

function FinanceSection({ summary, invoices, range }) {
  const billed = activeBilledAppointmentIds(invoices)
  const outstanding = invoices.filter((invoice) => (
    invoice.status === 'issued' && invoice.issuedOn && inDateRange(invoice.issuedOn, range)
  ))
  const outstandingPence = outstanding.reduce((sum, invoice) => sum + invoiceBalancePence(invoice), 0)
  const uninvoiced = summary.rows.filter((row) => row.earnedPence > 0 && !billed.has(row.id))
  const rows = uninvoiced.map((row) => ({
    id: row.id,
    filterValues: { client: row.clientName, service: row.serviceName, attendance: attendanceLabel(row.attendance) },
    sortValues: { date: row.sessionDate, client: row.clientName, fee: row.earnedPence },
    cells: {
      date: formatDisplayDate(row.sessionDate),
      client: row.clientName,
      service: row.serviceName,
      attendance: attendanceLabel(row.attendance),
      fee: formatGbpFromPence(row.earnedPence),
    },
  }))
  return (
    <div className="reporting-section">
      <div className="section-card__stat-row">
        <Stat label="Money earned" value={formatGbpFromPence(summary.earnedPence)} />
        <Stat
          label="Outstanding invoices"
          value={formatGbpFromPence(outstandingPence)}
          detail={outstanding.length ? `${outstanding.length} awaiting payment in these dates` : 'Awaiting payment in these dates'}
        />
        <Stat label="Sessions not yet invoiced" value={uninvoiced.length} />
      </div>
      <RecordTable
        columns={[
          { key: 'date', label: 'Date', sort: 'text' },
          { key: 'client', label: 'Client', filter: 'text' },
          { key: 'service', label: 'Service', filter: 'choice' },
          { key: 'attendance', label: 'Attendance', filter: 'choice' },
          { key: 'fee', label: 'Fee', sort: 'text' },
        ]}
        rows={rows}
        countNoun="sessions"
        emptyMessage="No sessions to invoice in these dates."
      />
    </div>
  )
}

function Stat({ label, value, detail }) {
  return (
    <div className="section-card__stat">
      <span className="section-card__stat-value">{value}</span>
      <span className="section-card__stat-label">{label}</span>
      {detail ? <span className="reporting-stat__detail">{detail}</span> : null}
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

async function listEpisodeDates() {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.from('episodes').select('id, client_id, status, end_date')
  if (error) throw error
  return data || []
}
