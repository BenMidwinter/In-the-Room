import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppSession } from '../../lib/AppSessionContext'
import {
  appointmentQueryKeys,
  useAllAppointmentsQuery,
} from '../../lib/appointmentQueries'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import UpcomingAgenda from '../../components/UpcomingAppointments'
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
  CALENDAR_INTERVAL_OPTIONS,
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
import { CalendarWorkspaceFrame, CalendarTimeSlot } from '../../components/LayoutComponents'

const VIEW_MODES = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'upcoming', label: 'Upcoming' },
]

function readViewMode(params) {
  const value = params.get('view')
  return VIEW_MODES.some((mode) => mode.id === value) ? value : 'week'
}

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

function EventChip({
  appointment,
  compact = false,
  blurNames = false,
  onSelect,
  onEdit,
  onDragStart,
  selected = false,
  style,
}) {
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
    : `${chipLabel} · ${timeRange}${otherInfo ? ` · ${otherInfo}` : ''}${cancelled ? ' · cancelled' : ''} · click to view, double-click to edit`

  const Tag = externalBusy ? 'div' : 'button'
  return (
    <Tag
      type={externalBusy ? undefined : 'button'}
      className={className}
      style={{ ...calendarEventStyleForAppointment(appointment), ...style }}
      title={title}
      draggable={!externalBusy}
      onDragStart={externalBusy ? undefined : (e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/appointment-id', appointment.id)
        e.dataTransfer.setData('application/x-itr-appointment', appointment.id)
        onDragStart?.(appointment)
      }}
      onClick={externalBusy ? undefined : (e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect?.(appointment)
      }}
      onDoubleClick={externalBusy ? undefined : (e) => {
        e.preventDefault()
        e.stopPropagation()
        onEdit?.(appointment)
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
  calendarOwner,
  ownerOptions,
  showOwnerPicker,
  onOwnerChange,
}) {
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

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

  const panel = open ? (
    <div
      ref={panelRef}
      className="calendar-view-options__panel"
      style={{ top: panelPos.top, left: panelPos.left }}
      role="dialog"
      aria-label="Calendar view options"
    >
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
        <label htmlFor="calendar-interval">Slot size</label>
        <select
          id="calendar-interval"
          className="paper-input"
          value={prefs.intervalMinutes}
          onChange={e => onChange({ intervalMinutes: Number(e.target.value) })}
        >
          {CALENDAR_INTERVAL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <p className="calendar-view-options__hint text-small text-muted">
        A smaller slot makes each hour taller, so every row stays easy to click. Events still use their real length.
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

function MonthView({ activeDate, appointments, onSelectDate, blurNames = false, onSelectAppointment, onEditAppointment }) {
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
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          onEditAppointment?.(appt)
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
  onEditAppointment,
  onDragAppointment,
  selectedAppointmentId,
  onEmptySlotClick,
  onDropOnSlot,
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
                onDragOver={(e) => {
                  if (!onDropOnSlot) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  if (!onDropOnSlot) return
                  e.preventDefault()
                  e.stopPropagation()
                  const id = e.dataTransfer.getData('application/x-itr-appointment')
                    || e.dataTransfer.getData('text/appointment-id')
                  if (id) onDropOnSlot(id, ymd, slot)
                }}
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
            onEdit={onEditAppointment}
            onDragStart={onDragAppointment}
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
  onEditAppointment,
  onDragAppointment,
  onDropOnSlot,
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
              onEditAppointment={onEditAppointment}
              onDragAppointment={onDragAppointment}
              onDropOnSlot={onDropOnSlot}
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
  onEditAppointment,
  onDragAppointment,
  onDropOnSlot,
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
        onEditAppointment={onEditAppointment}
        onDragAppointment={onDragAppointment}
        onDropOnSlot={onDropOnSlot}
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
  const { session } = useAppSession()
  const overlay = useAppointmentOverlay()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewModeState] = useState(() => readViewMode(searchParams))
  const [activeDate, setActiveDate] = useState(DEMO_TODAY)
  const [selectedId, setSelectedId] = useState(null)
  const { data: appointments = [] } = useAllAppointmentsQuery()
  const [viewPrefs, setViewPrefs] = useState(() => getCalendarViewPreferences())
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)

  const setViewMode = useCallback((next) => {
    setViewModeState(next)
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next === 'week') params.delete('view')
      else params.set('view', next)
      return params
    }, { replace: true })
  }, [setSearchParams])

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
    () => getCalendarOwnerOptions(persona),
    [persona],
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

  const filtered = useMemo(() => {
    const roleScoped = filterAppointmentsForPersona(appointments, persona)
    const owned = filterAppointmentsByCalendarOwner(roleScoped, calendarOwner, persona)
    return [...owned, ...googleBusy]
  }, [appointments, calendarOwner, persona, googleBusy])

  const blurNames = false

  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode

  const weekDates = weekDatesYmd(activeDate)

  const navigateDate = (deltaDays) => {
    setActiveDate(prev => addDaysYmd(prev, deltaDays))
  }

  const jumpToday = () => {
    setActiveDate(DEMO_TODAY)
    if (viewMode === 'upcoming') setViewMode('day')
  }

  const periodLabel = useMemo(() => {
    if (viewMode === 'upcoming') return 'Upcoming'
    if (viewMode === 'month') {
      return formatLongDate(startOfMonthYmd(activeDate)).split(',')[1]?.trim() || formatDisplayDate(startOfMonthYmd(activeDate))
    }
    if (viewMode === 'week') {
      return `${formatDisplayDate(weekDates[0])} – ${formatDisplayDate(weekDates[6])}`
    }
    return formatLongDate(activeDate)
  }, [viewMode, activeDate, weekDates])

  useEffect(() => {
    return overlay.register({
      onMove: (appt) => {
        setRescheduleTarget(appt)
        setSelectedId(appt?.id || null)
        if (appt?.session_date) setActiveDate(appt.session_date)
        const current = viewModeRef.current
        if (current === 'month' || current === 'upcoming') setViewMode('week')
      },
      onSaved: (saved, meta) => {
        if (saved?.session_date) setActiveDate(saved.session_date)
        if (saved?.id) setSelectedId(saved.id)
        const current = viewModeRef.current
        if (meta?.created && (current === 'month' || current === 'upcoming')) setViewMode('day')
      },
      onClose: () => setSelectedId(null),
    })
  }, [overlay, setViewMode])

  const selectAppointment = (appt) => {
    if (appt?.is_external_busy) return
    if (rescheduleTarget) setRescheduleTarget(null)
    setSelectedId(appt.id)
    overlay.openView(appt)
  }

  const applyMoveToSlot = (appt, sessionDate, startTime) => {
    const duration = Math.max(
      0,
      parseMinutes(appt.end_time) - parseMinutes(appt.start_time),
    ) || 60
    const endTime = hhmm(
      Math.floor((parseMinutes(startTime) + duration) / 60),
      (parseMinutes(startTime) + duration) % 60,
    )
    const moved = {
      ...appt,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
    }
    setRescheduleTarget(null)
    setSelectedId(moved.id)
    overlay.openEdit(moved)
  }

  const openScheduleSlot = (sessionDate, startTime, manual = false) => {
    if (rescheduleTarget) {
      applyMoveToSlot(rescheduleTarget, sessionDate, startTime)
      return
    }
    setSelectedId(null)
    overlay.openCreate({ sessionDate, startTime, manual })
  }

  const openAddAppointment = () => {
    setRescheduleTarget(null)
    openScheduleSlot(activeDate, hhmm(viewPrefs.startHour, 0), true)
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

  const handleEditAppointment = (appt) => {
    setRescheduleTarget(null)
    setSelectedId(appt.id)
    overlay.openEdit({
      ...appt,
      session_date: appt.session_date || appointmentSchedule(appt).session_date,
      start_time: appt.start_time || appointmentSchedule(appt).start_time,
    })
  }

  const handleDropOnSlot = (appointmentId, sessionDate, startTime) => {
    const appt = filtered.find((a) => a.id === appointmentId)
      || appointments.find((a) => a.id === appointmentId)
    if (!appt || appt.is_external_busy) return
    applyMoveToSlot(appt, sessionDate, startTime)
  }

  const gridHandlers = {
    blurNames,
    onSelectAppointment: selectAppointment,
    onEditAppointment: handleEditAppointment,
    onDropOnSlot: handleDropOnSlot,
    selectedAppointmentId: selectedId,
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
          onEditAppointment={handleEditAppointment}
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
      {viewMode === 'day' && (
        <DayView
          activeDate={activeDate}
          appointments={filtered}
          {...gridHandlers}
        />
      )}
      {viewMode === 'upcoming' && (
        <UpcomingAgenda onSelect={selectAppointment} />
      )}
    </>
  )

  return (
    <div
      className={`calendar-module${rescheduleTarget ? ' calendar-module--reschedule' : ''}`}
      data-service-catalog={serviceCatalogVersion}
    >
      {rescheduleTarget && (
        <div className="calendar-reschedule-banner" role="status">
          <p>
            Moving <strong>{rescheduleTarget.client_name || rescheduleTarget.service_name || 'session'}</strong>
            {' — '}click or drop onto a slot, then fine-tune if needed.
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
            {viewMode !== 'upcoming' && (
              <div className="calendar-toolbar__nav">
                <button type="button" className="calendar-toolbar__btn" onClick={() => navigateDate(viewMode === 'month' ? -30 : viewMode === 'day' ? -1 : -7)} aria-label="Previous period">←</button>
                <button type="button" className="calendar-toolbar__btn" onClick={() => navigateDate(viewMode === 'month' ? 30 : viewMode === 'day' ? 1 : 7)} aria-label="Next period">→</button>
              </div>
            )}
            <p className="calendar-toolbar__period">{periodLabel}</p>
          </div>
          <div className="calendar-toolbar__options">
            <div className="calendar-toolbar__views" role="tablist" aria-label="Calendar view">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode.id}
                  className={`calendar-toolbar__view${viewMode === mode.id ? ' calendar-toolbar__view--active' : ''}`}
                  onClick={() => setViewMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <CalendarViewOptions
              prefs={viewPrefs}
              open={viewOptionsOpen}
              onToggle={() => setViewOptionsOpen(o => !o)}
              onClose={() => setViewOptionsOpen(false)}
              onChange={handleViewPrefsChange}
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
    </div>
  )
}
