import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppSession } from '../../lib/AppSessionContext'
import { getClientsForUser } from '../../lib/store'
import {
  useAllAppointmentsQuery,
  useSaveAppointmentMutation,
} from '../../lib/appointmentQueries'
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
import { appointmentOtherInfo } from '../../lib/appointmentUtils'
import {
  getCalendarViewPreferences,
  saveCalendarViewPreferences,
  CALENDAR_START_HOUR_OPTIONS,
  CALENDAR_END_HOUR_OPTIONS,
  MIN_CALENDAR_INTERVAL,
  MAX_CALENDAR_INTERVAL,
} from '../../lib/calendarPreferences'
import {
  canPickCalendarOwner,
  filterAppointmentsByCalendarOwner,
  getCalendarOwnerOptions,
  getDefaultCalendarOwner,
} from '../../lib/calendarOwners'
import { modalityLabel } from '../../lib/calendarConstants'
import {
  calendarEventStyle,
  calendarDotStyle,
} from '../../lib/calendarServiceStyles'
import { shouldBlurClientIdentity } from '../../lib/demoPersonas'
import BlurredName from '../../components/BlurredName'
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
      result.push({
        appt: it.appt,
        top: ((it.start - dayStartMin) / total) * 100,
        height: ((it.end - it.start) / total) * 100,
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
  const timeRange = appointment.end_time
    ? `${appointment.start_time}–${appointment.end_time}`
    : appointment.start_time
  const otherInfo = appointmentOtherInfo(appointment)

  const className = [
    'calendar-event',
    'calendar-event--interactive',
    'calendar-event--block',
    'calendar-event--service',
    compact && 'calendar-event--compact',
    otherInfo && 'calendar-event--has-info',
    selected && 'calendar-event--selected',
    cancelled && 'calendar-event--cancelled',
  ].filter(Boolean).join(' ')

  const title = blurNames
    ? `${modalityLabel(appointment.therapy_modality)} · ${timeRange}${otherInfo ? ` · ${otherInfo}` : ''}${cancelled ? ' · cancelled' : ''}`
    : `${appointment.client_name} · ${modalityLabel(appointment.therapy_modality)} · ${timeRange}${otherInfo ? ` · ${otherInfo}` : ''}${cancelled ? ' · cancelled' : ''}`

  return (
    <button
      type="button"
      className={className}
      style={{ ...calendarEventStyle(appointment.therapy_modality), ...style }}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(appointment)
      }}
    >
      <span className="calendar-event__time">{timeRange}</span>
      <BlurredName as="span" name={appointment.client_name} blur={blurNames} className="calendar-event__client" />
      {!compact && (
        <span className="calendar-event__meta">{modalityLabel(appointment.therapy_modality)}</span>
      )}
      {otherInfo && (
        <span className="calendar-event__info">{otherInfo}</span>
      )}
      {!compact && !otherInfo && (
        <BlurredName as="span" name={appointment.assigned_therapist} blur={blurNames} className="calendar-event__therapist" />
      )}
    </button>
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
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
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
                        <span className="calendar-month__dot" style={calendarDotStyle(appt.therapy_modality)} />
                        <span className="calendar-month__event-text">
                          {appt.start_time}{' '}
                          <BlurredName name={appt.client_name.split(' ')[0]} blur={blurNames} className="inline" />
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
  className,
  style,
}) {
  const laidOut = useMemo(
    () => layoutDayEvents(appts, dayStartMin, dayEndMin),
    [appts, dayStartMin, dayEndMin],
  )

  const slotsPerHour = subSlotMinutes.length || 1

  return (
    <div
      className={`calendar-col${className ? ` ${className}` : ''}`}
      style={{ '--calendar-slots-per-hour': slotsPerHour, ...style }}
    >
      {hours.map(hour => (
        <div key={hour} className="calendar-col__hour">
          {subSlotMinutes.map((minute) => {
            const slot = hhmm(hour, minute)
            return (
              <CalendarTimeSlot
                key={slot}
                className="calendar-col__slot"
                onClick={() => onEmptySlotClick?.(ymd, slot)}
                title={`Book ${ymd} at ${slot}`}
              />
            )
          })}
        </div>
      ))}
      <div className="calendar-col__events">
        {laidOut.map(item => (
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
        showDayHeaders={false}
      />
    </div>
  )
}

export default function CalendarModule({ persona }) {
  const { myWorkplace, session } = useAppSession()
  const [viewMode, setViewMode] = useState('working-week')
  const [activeDate, setActiveDate] = useState(DEMO_TODAY)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [scheduleDraft, setScheduleDraft] = useState(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const { data: appointments = [] } = useAllAppointmentsQuery()
  const saveAppointmentMutation = useSaveAppointmentMutation()
  const [viewPrefs, setViewPrefs] = useState(() => getCalendarViewPreferences())
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)

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
    () => getClientsForUser(session.user.id, myWorkplace).filter(c => c.is_active !== false),
    [session.user.id, myWorkplace],
  )

  const roleFiltered = useMemo(
    () => filterAppointmentsForPersona(appointments, persona),
    [appointments, persona],
  )
  const filtered = useMemo(
    () => filterAppointmentsByCalendarOwner(appointments, calendarOwner, persona),
    [appointments, calendarOwner, persona],
  )

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
    setScheduleDraft(null)
    setSelectedAppointment(prev => (prev?.id === appt.id ? null : appt))
  }

  const openScheduleSlot = (sessionDate, startTime, manual = false) => {
    setSelectedAppointment(null)
    setScheduleDraft({ session_date: sessionDate, start_time: startTime, manual })
  }

  const openAddAppointment = () => {
    openScheduleSlot(activeDate, hhmm(viewPrefs.startHour, 0), true)
  }

  const closeSidePane = () => {
    setSelectedAppointment(null)
    setScheduleDraft(null)
  }

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
        location: selectedAppointment.location,
        attendance_status: status,
      },
      userId: session.user.id,
    })
    setSelectedAppointment(saved)
  }

  const handleScheduleSave = async (payload) => {
    setScheduleSaving(true)
    try {
      const dates = payload.dates?.length ? payload.dates : [payload.session_date]
      let last = null
      for (const date of dates) {
        last = await saveAppointmentMutation.mutateAsync({
          payload: {
            ...payload,
            session_date: date,
            dates: undefined,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
        })
      }
      setScheduleDraft(null)
      if (last) {
        setActiveDate(last.session_date)
        if (viewMode === 'month') setViewMode('day')
        setSelectedAppointment(last)
      }
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleRecurringSave = async (payload) => {
    setScheduleSaving(true)
    try {
      let last = null
      for (const date of payload.dates) {
        last = await saveAppointmentMutation.mutateAsync({
          payload: {
            client_id: payload.client_id,
            session_date: date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            duration_minutes: payload.duration_minutes,
            therapy_modality: payload.therapy_modality,
            location: payload.location,
            other_info: payload.other_info,
            appointment_type: payload.appointment_type,
            clinician_id: payload.clinician_id || session.user.id,
          },
          userId: session.user.id,
        })
      }
      setScheduleDraft(null)
      if (last) {
        setActiveDate(last.session_date)
        if (viewMode === 'month') setViewMode('day')
        setSelectedAppointment(last)
      }
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleEditAppointment = (appt) => {
    setSelectedAppointment(null)
    setScheduleDraft({
      mode: 'edit',
      appointment: appt,
      session_date: appt.session_date,
      start_time: appt.start_time,
    })
  }

  const handleBookAnother = (appt) => {
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
    setSelectedAppointment(null)
    setScheduleDraft({ mode: 'recurring', source: appt })
  }

  const gridHandlers = {
    blurNames,
    onSelectAppointment: selectAppointment,
    selectedAppointmentId: selectedAppointment?.id,
    hours,
    subSlotMinutes,
    dayStartMin,
    dayEndMin,
    onEmptySlotClick: openScheduleSlot,
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

  const paneOpen = Boolean(selectedAppointment || scheduleDraft)

  return (
    <div className="calendar-module">
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
        paneOpen={paneOpen}
        grid={(
          <ErrorBoundary label="calendar-grid">
            <div className="calendar-module__body">{calendarGrid}</div>
          </ErrorBoundary>
        )}
        accessory={(
          <ErrorBoundary label="calendar-pane">
            {scheduleDraft?.mode === 'recurring' ? (
              <RecurringSchedulePanel
                key={scheduleDraft.source.id}
                source={scheduleDraft.source}
                onSave={handleRecurringSave}
                onCancel={closeSidePane}
                saving={scheduleSaving}
              />
            ) : scheduleDraft ? (
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
                showDateField={Boolean(scheduleDraft.manual) || scheduleDraft.mode === 'book_another'}
                onSave={handleScheduleSave}
                onCancel={closeSidePane}
                saving={scheduleSaving}
              />
            ) : selectedAppointment ? (
              <EventDrawer
                appointment={selectedAppointment}
                allAppointments={filtered}
                onClose={closeSidePane}
                onAttendanceChange={handleAttendanceChange}
                onEdit={handleEditAppointment}
                onBookAnother={handleBookAnother}
                onRecurring={handleRecurring}
              />
            ) : null}
          </ErrorBoundary>
        )}
      />
    </div>
  )
}
