import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import RecordTable from '../../components/RecordTable'
import TagLabel from '../../components/TagLabel'
import { usePrompt } from '../../components/ui'
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
import { concessionFromClient, sessionBasePence } from '../../lib/sessionPrice'
import { listInvoices } from '../../lib/supabase/invoicesRepo'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments & Notes' },
  { id: 'clients', label: 'Clients' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'practice', label: 'My Practice' },
  { id: 'finance', label: 'Finance' },
]

const NOTE_LABEL = { complete: 'Signed off', draft: 'Draft', missing: 'Missing' }
const EMPTY_LIST = []
const OPEN_RANGE = { from: '0001-01-01', to: '9999-12-31' }

export default function ReportingPage() {
  const { session } = useAppSession()
  const userId = session?.user?.id
  const today = todayYmd()
  const [section, setSection] = useState('overview')
  const [applied, setApplied] = useState(() => ({
    datesOn: false,
    range: rollingWeekRange(todayYmd()),
    serviceId: '',
    tagId: '',
  }))
  const [draft, setDraft] = useState(() => ({
    datesOn: false,
    range: rollingWeekRange(todayYmd()),
    serviceId: '',
    tagId: '',
    serviceOn: false,
    tagOn: false,
  }))
  const range = applied.datesOn ? applied.range : OPEN_RANGE
  const serviceId = applied.serviceId
  const tagId = applied.tagId

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
  const placementsQuery = useQuery({
    queryKey: ['waitlist-placements', 'reporting'],
    queryFn: listWaitlistPlacements,
    enabled: Boolean(userId),
  })
  const invoicesQuery = useQuery({
    queryKey: ['invoices', userId],
    queryFn: () => listInvoices().catch(() => []),
    enabled: Boolean(userId),
  })
  const diarySpan = useMemo(() => {
    let from = today
    let to = today
    for (const appointment of appointmentsQuery.data || []) {
      const date = String(appointment.session_date || '').slice(0, 10)
      if (!date) continue
      if (date < from) from = date
      if (date > to) to = date
    }
    return { from, to }
  }, [appointmentsQuery.data, today])
  const busyRange = applied.datesOn ? applied.range : diarySpan
  const busyQuery = useQuery({
    queryKey: ['external-busy', 'reporting', busyRange.from, busyRange.to],
    queryFn: () => listExternalCalendarBlocks({
      fromIso: `${busyRange.from}T00:00:00`,
      toIso: `${busyRange.to}T23:59:59`,
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

  const clientsById = useMemo(() => {
    const map = new Map()
    for (const client of clientsQuery.data || []) map.set(client.id, client)
    return map
  }, [clientsQuery.data])
  const mapped = useMemo(() => {
    const own = (appointmentsQuery.data || []).map((appointment) => toReportAppointment(appointment, serviceById, clientsById.get(appointment.client_id)))
    const external = externalBlocksAsAppointments(busyQuery.data || [], userId || '').map((appointment) => ({
      ...toReportAppointment(appointment, serviceById, null),
      externalBusy: true,
      blockRole: 'busy',
    }))
    return [...own, ...external]
  }, [appointmentsQuery.data, busyQuery.data, serviceById, clientsById, userId])

  const tagKind = section === 'waitlist' ? 'waitlist' : 'client'
  const tagOptions = tagKind === 'waitlist' ? (waitlistTagsQuery.data || []) : (clientTagsQuery.data || [])
  const showTag = section === 'appointments' || section === 'clients' || section === 'waitlist' || section === 'finance'
  const activeTag = showTag ? tagId : ''
  const activeService = section !== 'clients' && section !== 'practice' ? serviceId : ''

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
    const window = applied.datesOn ? applied.range : diarySpan
    const buckets = timeBuckets(mapped, range)
    return efficiencyFromMinutes({
      availability: availabilityMinutes(availabilityQuery.data || [], window),
      ...buckets,
    })
  }, [mapped, range, applied.datesOn, applied.range, diarySpan, availabilityQuery.data])

  const changeSection = (next) => {
    setSection(next)
    setDraft((current) => ({ ...current, tagOn: false, tagId: '' }))
    setApplied((current) => ({ ...current, tagId: '' }))
  }

  return (
    <div className="page reporting-page">
      <PageHeader
        title="Reporting"
        help="Add a filter, then run the report."
      />

      <ReportingFilterBar
        today={today}
        section={section}
        draft={draft}
        applied={applied}
        services={services}
        tagOptions={tagOptions}
        showTag={showTag}
        tagKind={tagKind}
        userId={userId}
        onDraft={setDraft}
        onRun={setApplied}
      />

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
          serviceId={serviceId}
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
          placements={placementsQuery.data || EMPTY_LIST}
          clients={clientsQuery.data || EMPTY_LIST}
          appointments={appointmentsQuery.data || EMPTY_LIST}
          tagsByClient={tagsByClient}
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

const SAVED_FILTERS_KEY = 'reporting-saved-filters'

function readSavedFilters(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${SAVED_FILTERS_KEY}:${userId || 'local'}`) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSavedFilters(userId, rows) {
  localStorage.setItem(`${SAVED_FILTERS_KEY}:${userId || 'local'}`, JSON.stringify(rows))
}

function presetRange(preset, today) {
  if (preset === 'week') return rollingWeekRange(today)
  if (preset === 'month') return monthToDateRange(today)
  return quarterToDateRange(today)
}

function ReportingFilterBar({ today, section, draft, applied, services, tagOptions, showTag, tagKind, userId, onDraft, onRun }) {
  const prompt = usePrompt()
  const rootRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState([])

  useEffect(() => {
    if (!menu) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setMenu(null)
    }
    const onPointer = (event) => {
      if (rootRef.current?.contains(event.target)) return
      setMenu(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [menu])

  const choices = [
    { id: 'dates', label: 'Date range', enabled: !draft.datesOn },
    { id: 'service', label: 'Service', enabled: !draft.serviceOn },
    { id: 'client-tag', label: 'Client tag', enabled: showTag && tagKind === 'client' && !draft.tagOn },
    { id: 'waitlist-tag', label: 'Waitlist tag', enabled: section === 'waitlist' && !draft.tagOn },
  ]
  const visibleChoices = choices.filter((choice) => choice.label.toLowerCase().includes(query.trim().toLowerCase()))
  const activePreset = ['week', 'month', 'quarter'].find((preset) => {
    const next = presetRange(preset, today)
    return next.from === draft.range.from && next.to === draft.range.to
  })
  const pendingService = draft.serviceOn ? draft.serviceId : ''
  const pendingTag = draft.tagOn && showTag ? draft.tagId : ''
  const dirty = Boolean(draft.datesOn) !== Boolean(applied.datesOn)
    || (draft.datesOn && (draft.range.from !== applied.range.from || draft.range.to !== applied.range.to))
    || pendingService !== applied.serviceId
    || pendingTag !== applied.tagId

  const openMenu = (next) => {
    setSaved(readSavedFilters(userId))
    setMenu((current) => (current === next ? null : next))
    setQuery('')
  }

  const addChoice = (choice) => {
    if (!choice.enabled) return
    if (choice.id === 'dates') onDraft((current) => ({ ...current, datesOn: true, range: presetRange('week', today) }))
    if (choice.id === 'service') onDraft((current) => ({ ...current, serviceOn: true }))
    if (choice.id === 'client-tag' || choice.id === 'waitlist-tag') onDraft((current) => ({ ...current, tagOn: true, tagId: '' }))
    setMenu(null)
    setQuery('')
  }

  const run = () => {
    onRun({
      datesOn: draft.datesOn,
      range: draft.range,
      serviceId: pendingService,
      tagId: pendingTag,
    })
    setMenu(null)
  }

  const save = async () => {
    const name = await prompt({ title: 'Save filters', label: 'Name these filters', confirmLabel: 'Save' })
    const trimmed = String(name || '').trim()
    if (!trimmed) return
    const next = readSavedFilters(userId).filter((item) => item.name !== trimmed)
    next.push({
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()),
      name: trimmed,
      datesOn: draft.datesOn,
      range: draft.range,
      serviceOn: draft.serviceOn,
      serviceId: draft.serviceId,
      tagOn: draft.tagOn,
      tagId: draft.tagId,
    })
    writeSavedFilters(userId, next)
    setSaved(next)
    setMenu(null)
  }

  const load = (item) => {
    onDraft({
      datesOn: item.datesOn != null ? Boolean(item.datesOn) : Boolean(item.range?.from),
      range: item.range?.from && item.range?.to ? item.range : draft.range,
      serviceOn: Boolean(item.serviceOn),
      serviceId: item.serviceId || '',
      tagOn: Boolean(item.tagOn) && showTag,
      tagId: showTag ? (item.tagId || '') : '',
    })
    setMenu(null)
  }

  const removeSaved = (id) => {
    const next = readSavedFilters(userId).filter((item) => item.id !== id)
    writeSavedFilters(userId, next)
    setSaved(next)
  }

  return (
    <div ref={rootRef}>
      <div className="reporting-bar">
        <div className="reporting-menu">
          <button
            type="button"
            className="secondary"
            aria-expanded={menu === 'add'}
            onClick={() => openMenu('add')}
          >
            Add filter
          </button>
          {menu === 'add' && (
            <div className="reporting-menu__panel" role="dialog" aria-label="Add filter">
              <div className="reporting-menu__search">
                <input
                  className="paper-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Find a filter"
                  autoFocus
                />
              </div>
              {visibleChoices.length === 0 && <p className="reporting-menu__empty">No matching filters.</p>}
              {visibleChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="reporting-menu__item"
                  disabled={!choice.enabled}
                  onClick={() => addChoice(choice)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="secondary" onClick={save}>Save filters</button>
        <div className="reporting-menu">
          <button
            type="button"
            className="secondary"
            aria-expanded={menu === 'load'}
            onClick={() => openMenu('load')}
          >
            Load filters
          </button>
          {menu === 'load' && (
            <div className="reporting-menu__panel" role="dialog" aria-label="Load filters">
              {saved.length === 0 && <p className="reporting-menu__empty">No saved filters.</p>}
              {saved.map((item) => (
                <div key={item.id} className="reporting-menu__row">
                  <button type="button" className="reporting-menu__item" onClick={() => load(item)}>{item.name}</button>
                  <button type="button" className="reporting-menu__delete" aria-label={`Delete ${item.name}`} onClick={() => removeSaved(item.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {(draft.datesOn || draft.serviceOn || (draft.tagOn && showTag)) && (
          <>
        {draft.datesOn && (
          <div className="reporting-filter-row">
            <span className="reporting-filter-row__name">Date range</span>
            <select
              className="paper-input reporting-filter-row__preset"
              aria-label="Date preset"
              value={activePreset || 'custom'}
              onChange={(event) => {
                const preset = event.target.value
                if (preset === 'custom') return
                onDraft((current) => ({ ...current, range: presetRange(preset, today) }))
              }}
            >
              <option value="week">Rolling week</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="custom">Custom</option>
            </select>
            <input
              className="paper-input"
              type="date"
              aria-label="From"
              value={draft.range.from}
              onChange={(event) => onDraft((current) => ({ ...current, range: { ...current.range, from: event.target.value } }))}
            />
            <span className="reporting-filter-row__hint" aria-hidden="true">–</span>
            <input
              className="paper-input"
              type="date"
              aria-label="To"
              value={draft.range.to}
              onChange={(event) => onDraft((current) => ({ ...current, range: { ...current.range, to: event.target.value } }))}
            />
            <button
              type="button"
              className="secondary reporting-filter-row__remove"
              aria-label="Remove date range"
              onClick={() => onDraft((current) => ({ ...current, datesOn: false }))}
            >
              ×
            </button>
          </div>
        )}
        {draft.serviceOn && (
          <div className="reporting-filter-row">
            <span className="reporting-filter-row__name">Service</span>
            <select
              className="paper-input"
              aria-label="Service"
              value={draft.serviceId}
              onChange={(event) => onDraft((current) => ({ ...current, serviceId: event.target.value }))}
            >
              <option value="">All services</option>
              {services.filter((service) => service.is_active !== false).map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="secondary reporting-filter-row__remove"
              aria-label="Remove service filter"
              onClick={() => onDraft((current) => ({ ...current, serviceOn: false, serviceId: '' }))}
            >
              ×
            </button>
          </div>
        )}
        {draft.tagOn && showTag && (
          <div className="reporting-filter-row">
            <span className="reporting-filter-row__name">{tagKind === 'waitlist' ? 'Waitlist tag' : 'Client tag'}</span>
            <select
              className="paper-input"
              aria-label={tagKind === 'waitlist' ? 'Waitlist tag' : 'Client tag'}
              value={draft.tagId}
              onChange={(event) => onDraft((current) => ({ ...current, tagId: event.target.value }))}
            >
              <option value="">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="secondary reporting-filter-row__remove"
              aria-label="Remove tag filter"
              onClick={() => onDraft((current) => ({ ...current, tagOn: false, tagId: '' }))}
            >
              ×
            </button>
          </div>
        )}
          </>
        )}
        <button type="button" className="primary reporting-bar__run" onClick={run} aria-label={dirty ? 'Run report with these filters' : 'Run report'}>
          Run report
        </button>
      </div>
    </div>
  )
}

function Overview({ summary, efficiency }) {
  const rows = summary.byService.map((row) => ({
    id: row.serviceId,
    filterValues: { service: row.name },
    sortValues: {
      service: row.name,
      hours: row.minutes,
      attended: row.sessions,
      fees: row.earnedPence,
    },
    cells: {
      service: row.name,
      hours: formatHoursFromMinutes(row.minutes),
      attended: row.sessions,
      fees: formatGbpFromPence(row.earnedPence),
    },
  }))
  return (
    <div className="reporting-section">
      <div className="reporting-metrics">
        <Stat label="Hours delivered" value={formatHoursFromMinutes(summary.deliveredMinutes)} help="Attended sessions." />
        <Stat
          label="Sessions attended"
          value={summary.attended}
          detail={`${summary.dna} did not attend · ${summary.cancelled} cancelled`}
        />
        <Stat label="Fees" value={formatGbpFromPence(summary.earnedPence)} help="Attended, cancelled, and DNA, after the cancellation policy." />
        <Stat label="Notes to finish" value={summary.notesToFinish} help="Attended sessions without a signed Process Note." />
        <Stat
          label="Efficiency"
          value={efficiency.rate == null ? '—' : `${efficiency.rate}%`}
          help="Appointment, support, and admin time as a percentage of availability minus busy time. Open time is what is left after that."
          detail={`${formatHoursFromMinutes(efficiency.used)} used · ${formatHoursFromMinutes(efficiency.open)} open`}
        />
      </div>
      <RecordTable
        columns={[
          { key: 'service', label: 'Service', filter: 'choice', sort: 'text' },
          { key: 'hours', label: 'Hours', sort: 'number' },
          { key: 'attended', label: 'Attended', sort: 'number' },
          { key: 'fees', label: 'Fees', sort: 'number' },
        ]}
        rows={rows}
        countNoun="services"
        emptyMessage="Nothing in these dates."
      />
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
      <div className="reporting-metrics">
        <Stat
          label="Sessions attended"
          value={summary.attended}
          detail={`${summary.dna} did not attend · ${summary.cancelled} cancelled`}
        />
        <Stat
          label="Signed notes"
          value={signed}
          detail={`of ${summary.attended} attended`}
          help="Attended sessions with a signed Process Note."
        />
        <Stat
          label="Notes to finish"
          value={summary.notesToFinish}
          help="Attended sessions without a signed Process Note."
        />
      </div>
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

function ClientsSection({ clients, appointments, episodes, range, tagId, serviceId, tagsByClient }) {
  const clientsForService = new Set()
  for (const appointment of appointments) {
    if (!isClientSession(appointment) || !appointment.clientId) continue
    if (serviceId && appointment.serviceId !== serviceId) continue
    clientsForService.add(appointment.clientId)
  }
  const onService = (clientId) => !serviceId || clientsForService.has(clientId)
  const seen = new Map()
  for (const appointment of appointments) {
    if (!isClientSession(appointment)) continue
    if (!inDateRange(appointment.sessionDate, range)) continue
    if (serviceId && appointment.serviceId !== serviceId) continue
    if (!matchesClientTag(appointment.clientId, tagId, tagsByClient)) continue
    if (!appointment.clientId) continue
    const current = seen.get(appointment.clientId) || { sessions: 0, last: appointment.sessionDate }
    current.sessions += 1
    if (appointment.sessionDate > current.last) current.last = appointment.sessionDate
    seen.set(appointment.clientId, current)
  }
  const tagged = (client) => matchesClientTag(client.id, tagId, tagsByClient) && onService(client.id)
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
    && onService(episode.client_id)
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
      <div className="reporting-metrics">
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

function WaitlistSection({ people, tags, services, range, tagId, serviceId, today, placements, clients, appointments, tagsByClient }) {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const serviceById = new Map(services.map((service) => [service.id, service]))
  const matching = people.filter((person) => (
    (!tagId || (person.tagIds || []).includes(tagId))
    && (!serviceId || person.serviceId === serviceId)
  ))
  const joined = matching.filter((person) => inDateRange(String(person.createdAt || '').slice(0, 10), range))
  const left = leftWaitlistInRange({ placements, clients, appointments, range, tagId, serviceId, tagsByClient })
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
      <div className="reporting-metrics">
        <Stat label="On the waitlist now" value={matching.length} />
        <Stat label="Joined in these dates" value={joined.length} />
        <Stat
          label="Left in these dates"
          value={left}
          help="Booked into the diary in these dates, and no longer on the waitlist."
        />
        <Stat label="Average days waiting" value={average == null ? '—' : average} help="People on the waitlist now, counted to today." />
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
      <div className="reporting-metrics">
        <Stat label="Clinical hours" value={formatHoursFromMinutes(clinical)} help="Attended appointments." />
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
      <div className="reporting-metrics">
        <Stat label="Money earned" value={formatGbpFromPence(summary.earnedPence)} />
        <Stat
          label="Outstanding invoices"
          value={formatGbpFromPence(outstandingPence)}
          help="Issued in these dates and not yet paid."
          detail={outstanding.length ? `${outstanding.length} awaiting payment` : ''}
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

function Stat({ label, value, detail, help }) {
  return (
    <div className="reporting-metric">
      <div className="reporting-metric__label">
        <span>{label}</span>
        {help ? <MetricInfo text={help} label={`About ${label}`} /> : null}
      </div>
      <div className="reporting-metric__value">{value}</div>
      <div className="reporting-metric__detail">{detail || '\u00a0'}</div>
    </div>
  )
}

function MetricInfo({ text, label }) {
  const tipId = useId()
  return (
    <span className="reporting-metric__info">
      <button type="button" className="reporting-metric__info-btn" aria-label={label} aria-describedby={tipId}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path fill="currentColor" d="M7.2 7.05h1.6V11.7H7.2zM7.2 4.25h1.6V5.85H7.2z" />
        </svg>
      </button>
      <span id={tipId} className="reporting-metric__tip" role="tooltip">{text}</span>
    </span>
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

function isClientSession(appointment) {
  if (appointment.externalBusy || appointment.blockRole === 'busy' || appointment.blockRole === 'support' || appointment.blockRole === 'admin') return false
  if (appointment.attendance === 'cancelled') return false
  return true
}

function leftWaitlistInRange({ placements, clients, appointments, range, tagId, serviceId, tagsByClient }) {
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const bookedOn = new Map()
  for (const appointment of appointments) {
    if (!appointment.client_id || appointment.is_external_busy) continue
    const role = appointment.block_role || 'client_session'
    if (role !== 'client_session') continue
    const booked = String(appointment.created_at || '').slice(0, 10)
    if (!booked) continue
    const dates = bookedOn.get(appointment.client_id) || []
    dates.push(booked)
    bookedOn.set(appointment.client_id, dates)
  }
  return placements.filter((placement) => {
    const client = clientById.get(placement.client_id)
    if (!client || client.status === 'waitlist' || client.status === 'screener' || client.status === 'rejected') return false
    if (serviceId && placement.service_id !== serviceId) return false
    if (!matchesClientTag(placement.client_id, tagId, tagsByClient)) return false
    const placedOn = String(placement.created_at || '').slice(0, 10)
    const leftOn = (bookedOn.get(placement.client_id) || [])
      .filter((date) => !placedOn || date >= placedOn)
      .sort()[0]
    return Boolean(leftOn && inDateRange(leftOn, range))
  }).length
}

async function listWaitlistPlacements() {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.from('waitlist_placements').select('client_id, service_id, created_at')
  if (error) throw error
  return data || []
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
