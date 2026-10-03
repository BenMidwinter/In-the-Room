import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppSession } from '../../lib/AppSessionContext'
import { useAppClients } from '../../lib/queries'
import {
  appointmentQueryKeys,
  useAllAppointmentsQuery,
  useDeleteAppointmentsMutation,
  useSaveAppointmentMutation,
} from '../../lib/appointmentQueries'
import { useConfirm, useToast } from '../../components/ui'
import { appointmentBelongsToSeries, countSeriesScope } from '../../lib/appointmentSeries'
import SeriesScopeDialog from '../../components/SeriesScopeDialog'
import {
  externalBlocksAsAppointments,
  listCalendarConnections,
  listExternalCalendarBlocks,
} from '../../lib/supabase/calendarConnectionsRepo'
import { invokeFunction } from '../../lib/supabase/invokeFunction'
import ErrorBoundary from '../../components/ErrorBoundary'
import {
  DEMO_TODAY,
  addDaysYmd,
  formatDisplayDate,
  formatLongDate,
  formatWeekdayShort,
  monthGridDays,
  startOfMonthYmd,
  weekDatesYmd,
  workingWeekDatesYmd,
} from '../../lib/dateArchitecture'
import {
  filterAppointmentsForPersona,
  appointmentsForDate,
} from '../../lib/calendarAccess'
import { appointmentOtherInfo, appointmentSchedule } from '../../lib/appointmentUtils'
import {
  getCalendarViewPreferences,
  saveCalendarViewPreferences,
  syncCalendarPrefsFromAvailability,
  CALENDAR_START_HOUR_OPTIONS,
  CALENDAR_END_HOUR_OPTIONS,
  MIN_CALENDAR_INTERVAL,
  MAX_CALENDAR_INTERVAL,
} from '../../lib/calendarPreferences'
import { getClinicianWorkplaceSettings } from '../../lib/store'
import {
  getAvailabilityBounds,
  isMinutesWithinAvailability,
  unionWeeklyHours,
} from '../../lib/clinicianAvailability'
import { listAvailabilitySettings } from '../../lib/supabase/availabilityRepo'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import {
  canPickCalendarOwner,
  filterAppointmentsByCalendarOwner,
  getCalendarOwnerOptions,
  getDefaultCalendarOwner,
} from '../../lib/calendarOwners'
import {
  appointmentChipLabel,
  calendarDotStyle,
  calendarEventStyleForAppointment,
} from '../../lib/calendarServiceStyles'
import { listServices } from '../../lib/supabase/servicesRepo'
import { db } from '../../lib/data/collections'
import { shouldBlurClientIdentity } from '../../lib/demoPersonas'
import { CalendarWorkspaceFrame, CalendarTimeSlot, EventDrawer, ScheduleSessionPanel, RecurringSchedulePanel } from '../../components/LayoutComponents'

const VIEW_MODES = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'working-week', label: 'Working week' },
  { id: 'day', label: 'Day' },
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function hhmm(hour, minute) {
  return `${pad2(hour)}:${pad2(minute)}`
}

function parseMinutes(time) {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function eventEndMinutes(appt) {
  const start = parseMinutes(appt.start_time)
  if (appt.end_time) {
    const end = parseMinutes(appt.end_time)
    return end > start ? end : start + 30
  }
  return start + 60
}

function isCancelled(appt) {
  return appt.attendance_status === 'cancelled'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Position overlapping events: events keep their true start/duration (top/height)
 * and overlapping clusters are split into side-by-side lanes.
 */
function layoutDayEvents(appts, dayStartMin, dayEndMin) {
  const total = Math.max(1, dayEndMin - dayStartMin)
  // Keep short follow-on blocks tall enough to see a label (~12 minutes of day height).
  const minHeightPct = Math.min(8, (12 / total) * 100)
  const items = appts
    .map(appt => ({
      appt,
      start: clamp(parseMinutes(appt.start_time), dayStartMin, dayEndMin),
      end: clamp(eventEndMinutes(appt), dayStartMin, dayEndMin),
    }))
    .filter(it => it.end > dayStartMin && it.start < dayEndMin && it.end > it.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const result = []
  let cluster = []
  let clusterEnd = -1

  const flush = () => {
    const laneEnds = []
    cluster.forEach(it => {
      let lane = laneEnds.findIndex(end => end <= it.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(it.end)
      } else {
        laneEnds[lane] = it.end
      }
      it.lane = lane
    })
    const laneCount = laneEnds.length || 1
    cluster.forEach(it => {
      const width = 100 / laneCount
      const naturalHeight = ((it.end - it.start) / total) * 100
      result.push({
        appt: it.appt,
        top: ((it.start - dayStartMin) / total) * 100,
        height: Math.max(naturalHeight, minHeightPct),
        left: it.lane * width,
        width,
      })
    })
    cluster = []
    clusterEnd = -1
  }

  items.forEach(it => {
    if (cluster.length && it.start >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  })
  flush()

  return result
}

function EventChip({ appointment, compact = false, blurNames = false, onSelect, selected = false, style }) {
  const cancelled = isCancelled(appointment)
  const externalBusy = Boolean(appointment.is_external_busy)
  const timeRange = appointment.end_time
    ? `${appointment.start_time}–${appointment.end_time}`
    : appointment.start_time
  const otherInfo = appointmentOtherInfo(appointment)
  const chipLabel = appointmentChipLabel(appointment, { blurNames })

  const className = [
    'calendar-event',
    !externalBusy && 'calendar-event--interactive',
    'calendar-event--block',
    'calendar-event--service',
    externalBusy && 'calendar-event--external-busy',
    compact && 'calendar-event--compact',
    otherInfo && !externalBusy && 'calendar-event--has-info',
    selected && 'calendar-event--selected',
    cancelled && 'calendar-event--cancelled',
  ].filter(Boolean).join(' ')

  const title = externalBusy
    ? `Busy · ${timeRange}`
    : `${chipLabel} · ${timeRange}${otherInfo ? ` · ${otherInfo}` : ''}${cancelled ? ' · cancelled' : ''}`

  const Tag = externalBusy ? 'div' : 'button'
  return (
    <Tag
      type={externalBusy ? undefined : 'button'}
      className={className}
      style={{ ...calendarEventStyleForAppointment(appointment), ...style }}
      title={title}
      onClick={externalBusy ? undefined : (e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect?.(appointment)
      }}
    >
      <span className="calendar-event__time">{timeRange}</span>
      <span className="calendar-event__client">{chipLabel}</span>
      {otherInfo && !externalBusy && !compact && (
        <span className="calendar-event__info">{otherInfo}</span>
      )}
    </Tag>
  )
}

function CalendarViewOptions({
  prefs,
  open,
  onToggle,
  onClose,
  onChange,
  viewMode,
  onViewModeChange,
  calendarOwner,
  ownerOptions,
  showOwnerPicker,
  onOwnerChange,
}) {
  const [intervalDraft, setIntervalDraft] = useState(String(prefs.intervalMinutes))
  const [prevInterval, setPrevInterval] = useState(prefs.intervalMinutes)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  if (prefs.intervalMinutes !== prevInterval) {
    setPrevInterval(prefs.intervalMinutes)
    setIntervalDraft(String(prefs.intervalMinutes))
  }

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return

    const rect = trigger.getBoundingClientRect()
    const panelWidth = panel.offsetWidth
    const gap = 6
    const margin = 8
    const top = rect.bottom + gap
    let left = rect.right - panelWidth
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))

    setPanelPos({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePanelPosition()
  }, [open, updatePanelPosition])

  useEffect(() => {
    if (!open) return

    const onScrollOrResize = () => updatePanelPosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)

    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, updatePanelPosition])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      onClose()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const commitInterval = () => {
    if (intervalDraft.trim() === '') {
      setIntervalDraft(String(prefs.intervalMinutes))
      return
    }
    onChange({ intervalMinutes: intervalDraft })
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="calendar-view-options__panel"
      style={{ top: panelPos.top, left: panelPos.left }}
      role="dialog"
      aria-label="Calendar view options"
    >
      <div className="calendar-view-options__field">
        <label htmlFor="calendar-view-mode">View</label>
        <select
          id="calendar-view-mode"
          className="paper-input"
          value={viewMode}
          onChange={e => onViewModeChange(e.target.value)}
        >
          {VIEW_MODES.map(mode => (
            <option key={mode.id} value={mode.id}>{mode.label}</option>
          ))}
        </select>
      </div>
      {showOwnerPicker && (
        <div className="calendar-view-options__field">
          <label htmlFor="calendar-owner-select">View as</label>
          <select
            id="calendar-owner-select"
            className="paper-input"
            value={calendarOwner}
            onChange={e => onOwnerChange(e.target.value)}
          >
            {ownerOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="calendar-view-options__field">
        <label htmlFor="calendar-start-hour">Day starts</label>
        <select
          id="calendar-start-hour"
          className="paper-input"
          value={prefs.startHour}
          onChange={e => onChange({ startHour: Number(e.target.value) })}
        >
          {CALENDAR_START_HOUR_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="calendar-view-options__field">
        <label htmlFor="calendar-end-hour">Day ends</label>
        <select
          id="calendar-end-hour"
          className="paper-input"
          value={prefs.endHour}
          onChange={e => onChange({ endHour: Number(e.target.value) })}
        >
          {CALENDAR_END_HOUR_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="calendar-view-options__field">
        <label htmlFor="calendar-interval">Slot interval (minutes)</label>
        <input
          id="calendar-interval"
          type="number"
          inputMode="numeric"
          min={MIN_CALENDAR_INTERVAL}
          max={MAX_CALENDAR_INTERVAL}
          step={5}
          className="paper-input"
          value={intervalDraft}
          onChange={e => setIntervalDraft(e.target.value)}
          onBlur={commitInterval}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitInterval() } }}
        />
      </div>
      <p className="calendar-view-options__hint text-small text-muted">
        Grid lines mark each interval; events still span their true length.
      </p>
    </div>
  ) : null

  return (
    <div className="calendar-view-options">
      <button
        ref={triggerRef}
        type="button"
        className={`calendar-toolbar__btn calendar-view-options__trigger${open ? ' calendar-view-options__trigger--open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        View options
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  )
}

function MonthView({ activeDate, appointments, onSelectDate, blurNames = false, onSelectAppointment }) {
  const cells = monthGridDays(activeDate)
  const monthStart = startOfMonthYmd(activeDate)
  const monthLabel = formatLongDate(monthStart).split(',')[1]?.trim() || formatDisplayDate(monthStart)

  const byDate = useMemo(() => {
    const map = {}
    for (const appt of appointments) {
      if (!map[appt.session_date]) map[appt.session_date] = []
      map[appt.session_date].push(appt)
    }
    return map
  }, [appointments])

  return (
    <div className="calendar-month">
      <div className="calendar-month__head">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="calendar-month__weekday">{d}</div>
        ))}
      </div>
      <div className="calendar-month__grid">
        {cells.map((cell, idx) => {
          const dayAppts = cell.ymd ? (byDate[cell.ymd] || []) : []
          const isToday = cell.ymd === DEMO_TODAY
          const isActive = cell.ymd === activeDate
          return (
            <button
              key={idx}
              type="button"
              disabled={!cell.ymd}
              onClick={() => cell.ymd && onSelectDate(cell.ymd)}
              className={`calendar-month__cell${!cell.inMonth ? ' calendar-month__cell--muted' : ''}${isActive ? ' calendar-month__cell--active' : ''}`}
            >
              {cell.ymd && (
                <>
                  <span className={`calendar-month__day${isToday ? ' calendar-month__day--today' : ''}`}>
                    {Number(cell.ymd.slice(-2))}
                  </span>
                  <div className="calendar-month__events">
                    {dayAppts.slice(0, 3).map(appt => (
                      <button
                        key={appt.id}
                        type="button"
                        className={`calendar-month__event calendar-event--interactive${isCancelled(appt) ? ' calendar-month__event--cancelled' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectAppointment?.(appt)
                        }}
                      >
                        <span className="calendar-month__dot" style={calendarDotStyle(appt.service_id || appt.therapy_modality)} />
                        <span className="calendar-month__event-text">
                          {appt.start_time}{' '}
                          {appointmentChipLabel(appt, { blurNames })}
                        </span>
                      </button>
                    ))}
                    {dayAppts.length > 3 && (
                      <span className="calendar-month__more">+{dayAppts.length - 3} more</span>
                    )}
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>
      <p className="calendar-month__footer">{monthLabel}</p>
    </div>
  )
}

function DayColumn({
  ymd,
  appts,
  hours,
  subSlotMinutes,
  dayStartMin,
  dayEndMin,
  blurNames,
  compact,
  onSelectAppointment,
  selectedAppointmentId,
  onEmptySlotClick,
  weeklyHours,
  intervalMinutes,
  className,
  style,
}) {
  const laidOut = useMemo(
    () => layoutDayEvents(appts, dayStartMin, dayEndMin),
    [appts, dayStartMin, dayEndMin],
  )

  const slotsPerHour = subSlotMinutes.length || 1
  const slotSpan = intervalMinutes || 30

  return (
    <div
      className={`calendar-col${className ? ` ${className}` : ''}`}
      style={{ '--calendar-slots-per-hour': slotsPerHour, ...style }}
    >
      {hours.map(hour => (
        <div key={hour} className="calendar-col__hour">
          {subSlotMinutes.map((minute) => {
            const slot = hhmm(hour, minute)
            const startMin = hour * 60 + minute
            const available = isMinutesWithinAvailability(weeklyHours, ymd, startMin, startMin + slotSpan)
            return (
              <CalendarTimeSlot
                key={slot}
                className={`calendar-col__slot${available ? '' : ' calendar-col__slot--unavailable'}`}
                onClick={() => onEmptySlotClick?.(ymd, slot)}
                title={available ? `Book ${ymd} at ${slot}` : `Outside availability · ${ymd} at ${slot}`}
              />
            )
          })}
        </div>
      ))}
      <div className="calendar-col__busy" aria-hidden="true">
        {laidOut.filter((item) => item.appt.is_external_busy).map((item) => (
          <EventChip
            key={item.appt.id}
            appointment={item.appt}
            compact={compact}
            blurNames={blurNames}
            style={{
              top: `${item.top}%`,
              height: `${item.height}%`,
              left: `calc(${item.left}% + 2px)`,
              width: `calc(${item.width}% - 4px)`,
            }}
          />
        ))}
      </div>
      <div className="calendar-col__events">
        {laidOut.filter((item) => !item.appt.is_external_busy).map((item) => (
          <EventChip
            key={item.appt.id}
            appointment={item.appt}
            compact={compact}
            blurNames={blurNames}
            onSelect={onSelectAppointment}
            selected={selectedAppointmentId === item.appt.id}
            style={{
              top: `${item.top}%`,
              height: `${item.height}%`,
              left: `calc(${item.left}% + 2px)`,
              width: `calc(${item.width}% - 4px)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function TimeGridView({
  dates,
  appointments,
  activeDate,
  onSelectDate,
  blurNames = false,
  onSelectAppointment,
  selectedAppointmentId,
  hours,
  subSlotMinutes,
  dayStartMin,
  dayEndMin,
  onEmptySlotClick,
  weeklyHours,
  intervalMinutes,
  showDayHeaders = true,
}) {
  const byDate = useMemo(() => {
    const map = {}
    for (const appt of appointments) {
      if (!map[appt.session_date]) map[appt.session_date] = []
      map[appt.session_date].push(appt)
    }
    return map
  }, [appointments])

  const colCount = dates.length
  const hourCount = hours.length
  const slotsPerHour = subSlotMinutes.length || 1
  const headerRowOffset = showDayHeaders ? 1 : 0
  const firstHourRow = headerRowOffset + 1
  const dayColSpanEnd = firstHourRow + hourCount

  const gridStyle = {
    '--calendar-cols': colCount,
    '--calendar-hours': hourCount,
    '--calendar-slots-per-hour': slotsPerHour,
    '--calendar-header-rows': headerRowOffset,
  }

  return (
    <div className="calendar-time-grid-wrap">
      <div className="calendar-time-grid-scroll">
        <div
          className={`calendar-time-grid${showDayHeaders ? '' : ' calendar-time-grid--day-only'}`}
          style={gridStyle}
        >
          {showDayHeaders && (
            <>
              <div
                className="calendar-time-grid__corner"
                aria-hidden="true"
                style={{ gridColumn: 1, gridRow: 1 }}
              />
              {dates.map((ymd, colIdx) => {
                const isToday = ymd === DEMO_TODAY
                const isActive = ymd === activeDate
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => onSelectDate(ymd)}
                    className={`calendar-time-grid__day-head${isActive ? ' calendar-time-grid__day-head--active' : ''}`}
                    style={{ gridColumn: colIdx + 2, gridRow: 1 }}
                  >
                    <span className="calendar-time-grid__weekday">{formatWeekdayShort(ymd)}</span>
                    <span className={`calendar-time-grid__date${isToday ? ' calendar-time-grid__date--today' : ''}`}>
                      {Number(ymd.slice(-2))}
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {hours.map((hour, hourIdx) => (
            <div
              key={`label-${hour}`}
              className={`calendar-time-grid__hour-label${hourIdx === 0 ? ' calendar-time-grid__hour-label--first' : ''}`}
              style={{ gridColumn: 1, gridRow: hourIdx + firstHourRow }}
            >
              <span>{hhmm(hour, 0)}</span>
            </div>
          ))}

          {dates.map((ymd, colIdx) => (
            <DayColumn
              key={ymd}
              ymd={ymd}
              appts={byDate[ymd] || []}
              hours={hours}
              subSlotMinutes={subSlotMinutes}
              dayStartMin={dayStartMin}
              dayEndMin={dayEndMin}
              blurNames={blurNames}
              compact={colCount > 1}
              onSelectAppointment={onSelectAppointment}
              selectedAppointmentId={selectedAppointmentId}
              onEmptySlotClick={onEmptySlotClick}
              weeklyHours={weeklyHours}
              intervalMinutes={intervalMinutes}
              style={{
                gridColumn: colIdx + 2,
                gridRow: `${firstHourRow} / ${dayColSpanEnd}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayView({
  activeDate,
  appointments,
  blurNames = false,
  onSelectAppointment,
  selectedAppointmentId,
  hours,
  subSlotMinutes,
  dayStartMin,
  dayEndMin,
  onEmptySlotClick,
  weeklyHours,
  intervalMinutes,
}) {
  const dayAppts = useMemo(
    () => appointmentsForDate(appointments, activeDate),
    [appointments, activeDate],
  )

  return (
    <div className="calendar-day">
      <div className="calendar-day__header">
        <h3 className="calendar-day__title">{formatLongDate(activeDate)}</h3>
        <p className="calendar-day__count">{dayAppts.length} session{dayAppts.length === 1 ? '' : 's'}</p>
      </div>
      <TimeGridView
        dates={[activeDate]}
        appointments={appointments}
        activeDate={activeDate}
        onSelectDate={() => {}}
        blurNames={blurNames}
        onSelectAppointment={onSelectAppointment}
        selectedAppointmentId={selectedAppointmentId}
        hours={hours}
        subSlotMinutes={subSlotMinutes}
        dayStartMin={dayStartMin}
        dayEndMin={dayEndMin}
        onEmptySlotClick={onEmptySlotClick}
        weeklyHours={weeklyHours}
        intervalMinutes={intervalMinutes}
        showDayHeaders={false}
      />
    </div>
  )
}

export default function CalendarModule({ persona }) {
  const { myWorkplace, session } = useAppSession()
  const { clients: remoteClients = [] } = useAppClients()
  const [viewMode, setViewMode] = useState('week')
  const [activeDate, setActiveDate] = useState(DEMO_TODAY)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [scheduleDraft, setScheduleDraft] = useState(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const { data: appointments = [] } = useAllAppointmentsQuery()
  const saveAppointmentMutation = useSaveAppointmentMutation()
  const deleteAppointmentsMutation = useDeleteAppointmentsMutation()
  const confirm = useConfirm()
  const toast = useToast()
  const [viewPrefs, setViewPrefs] = useState(() => getCalendarViewPreferences())
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const [deleteScopeFor, setDeleteScopeFor] = useState(null)
  const [scheduleDeleting, setScheduleDeleting] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)

  const [availabilitySettings, setAvailabilitySettings] = useState(() => (
    getClinicianWorkplaceSettings(session.user.id)
  ))

  const externalBusyQuery = useQuery({
    queryKey: appointmentQueryKeys.externalBusy,
    enabled: isSupabaseConfigured(),
    queryFn: async () => {
      const connections = await listCalendarConnections()
      const google = connections.find((row) => row.provider === 'google' && row.status === 'connected')
      if (!google?.pull_external_busy) return []
      // Refresh Google busy in the background when the calendar opens.
      try {
        await invokeFunction('google-calendar-sync', { method: 'POST', body: {} })
      } catch {
        // Still show any cached blocks if sync fails (e.g. offline).
      }
      const fromIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      const toIso = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString()
      return listExternalCalendarBlocks({ fromIso, toIso })
    },
    staleTime: 5 * 60_000,
  })

  const googleBusy = useMemo(
    () => externalBlocksAsAppointments(externalBusyQuery.data || [], session.user.id),
    [externalBusyQuery.data, session.user.id],
  )

  const servicesQuery = useQuery({
    queryKey: ['services', 'calendar-catalog'],
    enabled: isSupabaseConfigured(),
    queryFn: listServices,
    staleTime: 60_000,
  })

  // Keep a React-state catalogue so chip labels/colours re-render after hydrate
  // (mutating db.orgServices alone does not trigger a paint).
  const [serviceCatalogVersion, setServiceCatalogVersion] = useState(0)
  useEffect(() => {
    const services = servicesQuery.data
    if (!services?.length) return
    for (const service of services) {
      const idx = db.orgServices.findIndex((row) => row.id === service.id || row.slug === service.slug)
      const mapped = {
        id: service.id,
        name: service.name,
        slug: service.slug,
        service_type: service.service_type || 'appointment',
        color: service.color,
        default_duration_minutes: service.default_duration_minutes,
        create_meet_link: Boolean(service.create_meet_link),
        follow_on_service_id: service.follow_on_service_id,
        follow_on_duration_minutes: service.follow_on_duration_minutes,
        is_active: service.is_active !== false,
      }
      if (idx === -1) db.orgServices.push(mapped)
      else db.orgServices[idx] = { ...db.orgServices[idx], ...mapped }
    }
    setServiceCatalogVersion((v) => v + 1)
  }, [servicesQuery.data])

  useEffect(() => {
    let cancelled = false
    async function loadAvailability() {
      const local = getClinicianWorkplaceSettings(session.user.id)
      if (!isSupabaseConfigured()) {
        if (!cancelled) setAvailabilitySettings(local)
        return
      }
      try {
        const remote = await listAvailabilitySettings()
        if (!cancelled) setAvailabilitySettings(remote.length ? remote : local)
      } catch {
        if (!cancelled) setAvailabilitySettings(local)
      }
    }
    loadAvailability()
    return () => { cancelled = true }
  }, [session.user.id])

  const weeklyHours = useMemo(
    () => unionWeeklyHours(availabilitySettings),
    [availabilitySettings],
  )

  useEffect(() => {
    const bounds = getAvailabilityBounds(weeklyHours)
    if (!bounds) return
    setViewPrefs(syncCalendarPrefsFromAvailability(bounds))
  }, [weeklyHours])

  const ownerOptions = useMemo(
    () => getCalendarOwnerOptions(persona, myWorkplace),
    [persona, myWorkplace],
  )
  const [calendarOwner, setCalendarOwner] = useState(() => getDefaultCalendarOwner(persona))
  const [prevPersona, setPrevPersona] = useState(persona)
  const showOwnerPicker = canPickCalendarOwner(persona)

  if (persona !== prevPersona) {
    setPrevPersona(persona)
    setCalendarOwner(getDefaultCalendarOwner(persona))
  }

  const hours = useMemo(() => {
    const out = []
    for (let h = viewPrefs.startHour; h < viewPrefs.endHour; h += 1) out.push(h)
    return out.length ? out : [9]
  }, [viewPrefs.startHour, viewPrefs.endHour])

  const subSlotMinutes = useMemo(() => {
    const out = []
    for (let m = 0; m < 60; m += viewPrefs.intervalMinutes) out.push(m)
    return out.length ? out : [0]
  }, [viewPrefs.intervalMinutes])

  const dayStartMin = viewPrefs.startHour * 60
  const dayEndMin = viewPrefs.endHour * 60

  const assignedClients = useMemo(
    () => remoteClients.filter(c => c.is_active !== false),
    [remoteClients],
  )

  const filtered = useMemo(() => {
    const roleScoped = filterAppointmentsForPersona(appointments, persona)
    const owned = filterAppointmentsByCalendarOwner(roleScoped, calendarOwner, persona)
    return [...owned, ...googleBusy]
  }, [appointments, calendarOwner, persona, googleBusy])

  const blurNames = shouldBlurClientIdentity(persona)

  const weekDates = weekDatesYmd(activeDate)
  const workingDates = workingWeekDatesYmd(activeDate)

  const navigateDate = (deltaDays) => {
    setActiveDate(prev => addDaysYmd(prev, deltaDays))
  }

  const jumpToday = () => setActiveDate(DEMO_TODAY)

  const periodLabel = useMemo(() => {
    switch (viewMode) {
      case 'month':
        return formatLongDate(startOfMonthYmd(activeDate)).split(',')[1]?.trim() || formatDisplayDate(startOfMonthYmd(activeDate))
      case 'week':
        return `${formatDisplayDate(weekDates[0])} – ${formatDisplayDate(weekDates[6])}`
      case 'working-week':
        return `${formatDisplayDate(workingDates[0])} – ${formatDisplayDate(workingDates[4])}`
      default:
        return formatLongDate(activeDate)
    }
  }, [viewMode, activeDate, weekDates, workingDates])

  const selectAppointment = (appt) => {
    if (appt?.is_external_busy) return
    // Leave reschedule mode if the clinician picks another event.
    if (rescheduleTarget) setRescheduleTarget(null)
    // View overlay (attendance / details). Edit is a separate overlay from there.
    setScheduleDraft(null)
    setSelectedAppointment((prev) => (prev?.id === appt.id ? null : appt))
  }

  const openScheduleSlot = (sessionDate, startTime, manual = false) => {
    if (rescheduleTarget) {
      const duration = Math.max(
        0,
        parseMinutes(rescheduleTarget.end_time) - parseMinutes(rescheduleTarget.start_time),
      ) || 60
      const endTime = hhmm(
        Math.floor((parseMinutes(startTime) + duration) / 60),
        (parseMinutes(startTime) + duration) % 60,
      )
      const moved = {
        ...rescheduleTarget,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
      }
      setRescheduleTarget(null)
      setSelectedAppointment(null)
      setScheduleDraft({
        mode: 'edit',
        appointment: moved,
        session_date: sessionDate,
        start_time: startTime,
        manual: true,
      })
      return
    }
    setSelectedAppointment(null)
    setScheduleDraft({ mode: 'create', session_date: sessionDate, start_time: startTime, manual })
  }

  const openAddAppointment = () => {
    setRescheduleTarget(null)
    openScheduleSlot(activeDate, hhmm(viewPrefs.startHour, 0), true)
  }

  const closeSidePane = () => {
    setSelectedAppointment(null)
    setScheduleDraft(null)
  }

  const cancelReschedule = () => setRescheduleTarget(null)

  useEffect(() => {
    if (!rescheduleTarget) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setRescheduleTarget(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rescheduleTarget])

  const handleViewPrefsChange = (patch) => {
    setViewPrefs(prev => saveCalendarViewPreferences({ ...prev, ...patch }))
  }

  const handleAttendanceChange = async (status) => {
    if (!selectedAppointment) return
    const saved = await saveAppointmentMutation.mutateAsync({
      payload: {
        id: selectedAppointment.id,
        client_id: selectedAppointment.client_id,
        session_date: selectedAppointment.session_date,
        start_time: selectedAppointment.start_time,
        end_time: selectedAppointment.end_time,
        appointment_type: selectedAppointment.appointment_type,
        therapy_modality: selectedAppointment.therapy_modality,
        service_id: selectedAppointment.service_id,
        service_name: selectedAppointment.service_name,
        location: selectedAppointment.location,
        other_info: selectedAppointment.other_info,
        block_role: selectedAppointment.block_role || 'client_session',
        clinician_id: selectedAppointment.clinician_id,
        attendance_status: status,
      },
      userId: session.user.id,
    })
    setSelectedAppointment(saved)
  }

  const handleScheduleSave = async (payload, scope = 'this') => {
    setScheduleSaving(true)
    try {
      const dates = payload.dates?.length ? payload.dates : [payload.session_date]
      const seriesId = payload.series_id
        || (dates.length > 1
          ? (typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `series-${Date.now()}`)
          : undefined)

      // Editing an existing session (possibly a series scope).
      if (payload.id && !payload.dates?.length) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            dates: undefined,
            series_id: payload.series_id || undefined,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
          scope,
          allAppointments: filtered,
        })
        setScheduleDraft(null)
        if (saved) {
          setActiveDate(saved.session_date)
          setSelectedAppointment(saved) // return to view overlay
          toast.saved(scope === 'this' ? 'Appointment updated' : 'Series updated')
        } else {
          setSelectedAppointment(null)
        }
        return
      }

      let first = null
      let last = null
      for (const date of dates) {
        last = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            session_date: date,
            dates: undefined,
            series_id: seriesId,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
        })
        if (!first) first = last
        if (last?.id && /^[0-9a-f-]{36}$/i.test(last.id) && payload.create_meet_link) {
          try {
            const { createMeetForAppointment } = await import('../../lib/supabase/googleMeet')
            const startsAt = `${last.session_date}T${last.start_time}:00`
            const endsAt = `${last.session_date}T${last.end_time}:00`
            const meet = await createMeetForAppointment({
              appointmentId: last.id,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              summary: 'In the Room session',
            })
            if (meet.meetUrl) {
              last = { ...last, meet_url: meet.meetUrl }
              if (first?.id === last.id) first = last
            }
          } catch {
            // Meet is best-effort; booking still succeeds.
          }
        }
      }
      setScheduleDraft(null)
      setSelectedAppointment(null)
      // Stay on the first occurrence — jumping to the series end is confusing.
      if (first) {
        setActiveDate(first.session_date)
        if (viewMode === 'month') setViewMode('day')
        toast.saved(dates.length > 1 ? `Booked ${dates.length} sessions` : 'Appointment booked')
      }
    } finally {
      setScheduleSaving(false)
    }
  }

  const runDelete = async (appointment, scope = 'this') => {
    setScheduleDeleting(true)
    try {
      await deleteAppointmentsMutation.mutateAsync({
        appointment,
        scope,
        allAppointments: filtered,
      })
      setScheduleDraft(null)
      setSelectedAppointment(null)
      setDeleteScopeFor(null)
      toast.saved(scope === 'this' ? 'Appointment deleted' : 'Appointments deleted')
    } finally {
      setScheduleDeleting(false)
    }
  }

  const handleDeleteAppointment = async (appointment, scope) => {
    if (!appointment) return
    if (scope) {
      await runDelete(appointment, scope)
      return
    }
    if (appointmentBelongsToSeries(appointment, filtered)) {
      setDeleteScopeFor(appointment)
      return
    }
    const ok = await confirm({
      title: 'Delete appointment?',
      message: `Remove the session on ${appointment.session_date} at ${appointment.start_time}?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await runDelete(appointment, 'this')
  }

  const handleRecurringSave = async (payload) => {
    setScheduleSaving(true)
    try {
      const seriesId = payload.series_id
        || (payload.dates?.length > 1
          ? (typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `series-${Date.now()}`)
          : undefined)
      let first = null
      for (const date of payload.dates) {
        const saved = await saveAppointmentMutation.mutateAsync({
          payload: {
            client_id: payload.client_id,
            session_date: date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            duration_minutes: payload.duration_minutes,
            therapy_modality: payload.therapy_modality,
            service_id: payload.service_id,
            service_name: payload.service_name,
            series_id: seriesId,
            location: payload.location,
            other_info: payload.other_info,
            appointment_type: payload.appointment_type,
            clinician_id: payload.clinician_id || session.user.id,
            block_role: payload.block_role || 'client_session',
          },
          userId: session.user.id,
        })
        if (!first) first = saved
      }
      setScheduleDraft(null)
      setSelectedAppointment(null)
      if (first) {
        setActiveDate(first.session_date)
        if (viewMode === 'month') setViewMode('day')
      }
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleEditAppointment = (appt) => {
    // Close the right-hand drawer first; edit always uses the centred overlay.
    setRescheduleTarget(null)
    setSelectedAppointment(null)
    setScheduleDraft({
      mode: 'edit',
      appointment: appt,
      session_date: appt.session_date || appointmentSchedule(appt).session_date,
      start_time: appt.start_time || appointmentSchedule(appt).start_time,
      manual: true,
    })
  }

  const handleBookAnother = (appt) => {
    setRescheduleTarget(null)
    setSelectedAppointment(null)
    setScheduleDraft({
      mode: 'book_another',
      prefill: appt,
      session_date: addDaysYmd(appt.session_date, 7),
      start_time: appt.start_time,
      manual: true,
    })
  }

  const handleRecurring = (appt) => {
    setRescheduleTarget(null)
    setSelectedAppointment(null)
    setScheduleDraft({ mode: 'recurring', source: appt })
  }

  const handleReschedule = (appt) => {
    setSelectedAppointment(null)
    setScheduleDraft(null)
    setRescheduleTarget(appt)
    if (appt?.session_date) setActiveDate(appt.session_date)
    if (viewMode === 'month') setViewMode('week')
  }

  const gridHandlers = {
    blurNames,
    onSelectAppointment: selectAppointment,
    selectedAppointmentId: selectedAppointment?.id
      || (scheduleDraft?.mode === 'edit' ? scheduleDraft.appointment?.id : undefined),
    hours,
    subSlotMinutes,
    dayStartMin,
    dayEndMin,
    onEmptySlotClick: openScheduleSlot,
    weeklyHours,
    intervalMinutes: viewPrefs.intervalMinutes,
  }

  const calendarGrid = (
    <>
      {viewMode === 'month' && (
        <MonthView
          activeDate={activeDate}
          appointments={filtered}
          onSelectDate={(d) => { setActiveDate(d); setViewMode('day') }}
          blurNames={blurNames}
          onSelectAppointment={selectAppointment}
        />
      )}
      {viewMode === 'week' && (
        <TimeGridView
          dates={weekDates}
          appointments={filtered}
          activeDate={activeDate}
          onSelectDate={setActiveDate}
          {...gridHandlers}
        />
      )}
      {viewMode === 'working-week' && (
        <TimeGridView
          dates={workingDates}
          appointments={filtered}
          activeDate={activeDate}
          onSelectDate={setActiveDate}
          {...gridHandlers}
        />
      )}
      {viewMode === 'day' && (
        <DayView
          activeDate={activeDate}
          appointments={filtered}
          {...gridHandlers}
        />
      )}
    </>
  )

  // Side pane only for recurring helper — view + edit/create use centred overlays.
  const showRecurringOverlay = scheduleDraft?.mode === 'recurring'
  const showScheduleOverlay = Boolean(scheduleDraft && scheduleDraft.mode !== 'recurring')
  const showViewOverlay = Boolean(selectedAppointment && !showScheduleOverlay && !showRecurringOverlay)

  const closeScheduleOverlay = () => {
    if (scheduleDraft?.mode === 'edit' && scheduleDraft.appointment) {
      setSelectedAppointment(scheduleDraft.appointment)
      setScheduleDraft(null)
      return
    }
    closeSidePane()
  }

  return (
    <div
      className={`calendar-module${rescheduleTarget ? ' calendar-module--reschedule' : ''}`}
      data-service-catalog={serviceCatalogVersion}
    >
      {rescheduleTarget && (
        <div className="calendar-reschedule-banner" role="status">
          <p>
            Rescheduling <strong>{rescheduleTarget.client_name || rescheduleTarget.service_name || 'session'}</strong>
            {' — '}click a calendar slot, then fine-tune in the edit panel.
          </p>
          <button type="button" className="secondary" onClick={cancelReschedule}>
            Cancel
          </button>
        </div>
      )}
      <header className="page-header page-header--with-toolbar page-header--calendar">
        <div className="page-header__text">
          <h1 className="page-header__title">Calendar</h1>
        </div>
        <div className="page-header__toolbar calendar-toolbar">
          <div className="calendar-toolbar__primary">
            <button type="button" className="calendar-toolbar__btn calendar-toolbar__btn--add" onClick={openAddAppointment}>
              + Add Appointment
            </button>
            <button type="button" className="calendar-toolbar__btn calendar-toolbar__btn--today" onClick={jumpToday}>
              Today
            </button>
            <div className="calendar-toolbar__nav">
              <button type="button" className="calendar-toolbar__btn" onClick={() => navigateDate(viewMode === 'month' ? -30 : viewMode === 'day' ? -1 : -7)} aria-label="Previous period">←</button>
              <button type="button" className="calendar-toolbar__btn" onClick={() => navigateDate(viewMode === 'month' ? 30 : viewMode === 'day' ? 1 : 7)} aria-label="Next period">→</button>
            </div>
            <p className="calendar-toolbar__period">{periodLabel}</p>
          </div>
          <div className="calendar-toolbar__options">
            <CalendarViewOptions
              prefs={viewPrefs}
              open={viewOptionsOpen}
              onToggle={() => setViewOptionsOpen(o => !o)}
              onClose={() => setViewOptionsOpen(false)}
              onChange={handleViewPrefsChange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              calendarOwner={calendarOwner}
              ownerOptions={ownerOptions}
              showOwnerPicker={showOwnerPicker}
              onOwnerChange={setCalendarOwner}
            />
          </div>
        </div>
      </header>

      <CalendarWorkspaceFrame
        paneOpen={false}
        grid={(
          <ErrorBoundary label="calendar-grid">
            <div className="calendar-module__body">{calendarGrid}</div>
          </ErrorBoundary>
        )}
      />

      {showViewOverlay && (
        <ErrorBoundary label="calendar-view-overlay">
          <EventDrawer
            appointment={selectedAppointment}
            allAppointments={filtered}
            presentation="overlay"
            onClose={closeSidePane}
            onAttendanceChange={handleAttendanceChange}
            onEdit={handleEditAppointment}
            onBookAnother={handleBookAnother}
            onRecurring={handleRecurring}
            onReschedule={handleReschedule}
            onDelete={handleDeleteAppointment}
          />
        </ErrorBoundary>
      )}

      {showRecurringOverlay && (
        <ErrorBoundary label="calendar-recurring-overlay">
          <RecurringSchedulePanel
            key={scheduleDraft.source.id}
            source={scheduleDraft.source}
            onSave={handleRecurringSave}
            onCancel={closeSidePane}
            saving={scheduleSaving}
            presentation="overlay"
          />
        </ErrorBoundary>
      )}

      {showScheduleOverlay && (
        <ErrorBoundary label="calendar-schedule-overlay">
          <ScheduleSessionPanel
            key={scheduleDraft.appointment?.id || scheduleDraft.prefill?.id || `${scheduleDraft.mode}-${scheduleDraft.session_date}-${scheduleDraft.start_time}`}
            sessionDate={scheduleDraft.session_date}
            startTime={scheduleDraft.start_time}
            appointment={scheduleDraft.mode === 'edit' ? scheduleDraft.appointment : null}
            prefill={scheduleDraft.mode === 'book_another' ? scheduleDraft.prefill : null}
            clients={assignedClients}
            allAppointments={filtered}
            sessionUserId={session.user.id}
            myWorkplace={myWorkplace}
            calendarOwner={calendarOwner}
            showDateField={Boolean(scheduleDraft.manual) || scheduleDraft.mode === 'book_another' || scheduleDraft.mode === 'edit'}
            presentation="overlay"
            onSave={handleScheduleSave}
            onDelete={handleDeleteAppointment}
            onCancel={closeScheduleOverlay}
            saving={scheduleSaving}
            deleting={scheduleDeleting}
          />
        </ErrorBoundary>
      )}

      {deleteScopeFor && (
        <SeriesScopeDialog
          action="delete"
          onCancel={() => setDeleteScopeFor(null)}
          countForScope={(scope) => countSeriesScope(deleteScopeFor, filtered, scope)}
          onSelect={(scope) => runDelete(deleteScopeFor, scope)}
        />
      )}
    </div>
  )
}
