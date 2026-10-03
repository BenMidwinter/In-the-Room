import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  APPOINTMENT_TYPES,
  getProgressNoteByAppointment,
  getWorkplaceClinicians,
} from '../lib/store'
import {
  formatAppointmentDateTime,
  attendanceLabel,
  appointmentTypeLabel,
  appointmentOtherInfo,
} from '../lib/appointmentUtils'
import { modalityLabel } from '../lib/calendarConstants'
import { getAppointmentOrgServices } from '../lib/store'
import { addDaysYmd } from '../lib/dateArchitecture'
import { canAssignAppointmentClinician } from '../lib/permissions'
import { CALENDAR_OWNER_ALL, CALENDAR_OWNER_ALL_TEAM } from '../lib/calendarOwners'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/* ── Core workspace shell ─────────────────────────────────────────────── */

/** Full-height clinical workspace with optional sticky chrome + scroll region. */
export function WorkspaceLayout({ className, children, scroll = false, ...props }) {
  if (scroll) {
    return (
      <div className={cx('ck-workspace', className)} {...props}>
        <div className="ck-workspace__scroll">{children}</div>
      </div>
    )
  }
  return (
    <div className={cx('ck-workspace', className)} {...props}>
      {children}
    </div>
  )
}

/** Sticky context bar — patient ID, save/finalize actions stay visible while scrolling. */
export function StickyContextBar({
  leading,
  trailing,
  meta,
  sub = false,
  className,
  children,
  ...props
}) {
  return (
    <header
      className={cx('ck-sticky-bar', sub && 'ck-sticky-bar--sub', className)}
      {...props}
    >
      {leading && <div className="ck-sticky-bar__leading">{leading}</div>}
      {meta && <div className="ck-sticky-bar__meta">{meta}</div>}
      {children}
      {trailing && <div className="ck-sticky-bar__trailing">{trailing}</div>}
    </header>
  )
}

/** Digital paper wrapper — constrains prose to letter/A4 width with elevation. */
export function ClinicalPaper({
  children,
  variant = 'letter',
  flat = false,
  className,
  as: Tag = 'div',
  ...props
}) {
  return (
    <Tag
      className={cx(
        'ck-clinical-paper',
        variant === 'a4' && 'ck-clinical-paper--a4',
        variant === 'optimal' && 'ck-clinical-paper--optimal',
        flat && 'ck-clinical-paper--flat',
        className,
      )}
      {...props}
    >
      <div className="ck-clinical-paper__canvas">
        <div className="ck-clinical-paper__sheet">{children}</div>
      </div>
    </Tag>
  )
}

/** Split workspace — main canvas shrinks when accessory pane is open (non-blocking). */
export function SplitWorkspace({
  main,
  accessory,
  paneOpen = false,
  paneSize = 'default',
  className,
  mainClassName,
  accessoryClassName,
  children,
}) {
  if (children) {
    return (
      <div
        className={cx(
          'ck-split',
          paneOpen && 'ck-split--pane-open',
          paneSize === 'lg' && 'ck-split--pane-lg',
          className,
        )}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={cx(
        'ck-split',
        paneOpen && 'ck-split--pane-open',
        paneSize === 'lg' && 'ck-split--pane-lg',
        className,
      )}
    >
      <div className={cx('ck-split__main', mainClassName)}>{main}</div>
      {paneOpen && accessory && (
        <aside className={cx('ck-split__accessory', accessoryClassName)} aria-label="Accessory panel">
          {accessory}
        </aside>
      )}
    </div>
  )
}

/** Accessory pane shell — side drawer content without blocking overlay. */
export function AccessoryPane({
  title,
  subtitle,
  onClose,
  children,
  className,
  bodyClassName,
  closeLabel = 'Close panel',
}) {
  return (
    <div className={cx('ck-accessory-pane', className)}>
      {(title || onClose) && (
        <div className="ck-accessory-pane__head">
          <div>
            {title && <h2 className="ck-accessory-pane__title">{title}</h2>}
            {subtitle && <p className="ck-accessory-pane__subtitle">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              className="secondary ck-accessory-pane__close"
              onClick={onClose}
              aria-label={closeLabel}
            >
              ✕
            </button>
          )}
        </div>
      )}
      <div className={cx('ck-accessory-pane__body', bodyClassName)}>{children}</div>
    </div>
  )
}

/* ── Stacked data rows ────────────────────────────────────────────────── */

export function StackedDataList({ children, className, as: Tag = 'ul', ...props }) {
  return (
    <Tag className={cx('ck-stacked-list', className)} {...props}>
      {children}
    </Tag>
  )
}

export function StackedDataRow({
  icon,
  label,
  value,
  meta,
  tags,
  href,
  children,
  className,
  as: Tag = 'li',
}) {
  const body = (
    <>
      <div className="ck-stacked-row__icon" aria-hidden>
        {icon}
      </div>
      <div className="ck-stacked-row__body">
        {label && <span className="ck-stacked-row__label">{label}</span>}
        {value && (
          href ? (
            <Link to={href} className="ck-stacked-row__value">{value}</Link>
          ) : (
            <span className="ck-stacked-row__value">{value}</span>
          )
        )}
        {meta && <span className="ck-stacked-row__meta">{meta}</span>}
        {tags && <div className="ck-stacked-row__tags">{tags}</div>}
        {children}
      </div>
    </>
  )

  return (
    <Tag className={cx('ck-stacked-row', className)}>
      {body}
    </Tag>
  )
}

export function DataTag({ variant = 'draft', children, className }) {
  return (
    <span className={cx('ck-tag', `ck-tag--${variant}`, className)}>
      {children}
    </span>
  )
}

/* ── Context banners & safety locks ───────────────────────────────────── */

export function ContextBanner({
  variant = 'info',
  title,
  children,
  actions,
  className,
}) {
  return (
    <div className={cx('ck-context-banner', `ck-context-banner--${variant}`, className)} role="status">
      {title && <p className="ck-context-banner__title">{title}</p>}
      {children && <div className="ck-context-banner__body">{children}</div>}
      {actions && <div className="ck-context-banner__actions">{actions}</div>}
    </div>
  )
}

export function SafetyLock({ locked = false, reason, children, className }) {
  return (
    <div className={cx('ck-safety-lock', locked && 'ck-safety-lock--locked', className)}>
      {locked && reason && (
        <p className="ck-safety-lock__overlay" role="note">{reason}</p>
      )}
      <div className="ck-safety-lock__content">{children}</div>
    </div>
  )
}

/* ── Calendar frame & time slots ──────────────────────────────────────── */

export function CalendarWorkspaceFrame({
  grid,
  accessory,
  paneOpen = false,
  className,
  gridClassName,
  accessoryClassName,
  style,
}) {
  return (
    <div
      className={cx('ck-calendar-frame', paneOpen && 'ck-calendar-frame--pane-open', className)}
      style={style}
    >
      <div className={cx('ck-calendar-frame__grid', gridClassName)}>{grid}</div>
      {paneOpen && accessory && (
        <aside className={cx('ck-calendar-frame__accessory', accessoryClassName)} aria-label="Calendar context">
          {accessory}
        </aside>
      )}
    </div>
  )
}

export function CalendarTimeSlot({
  children,
  droppable = false,
  dragOver = false,
  className,
  onClick,
  ...props
}) {
  return (
    <div
      className={cx(
        'ck-time-slot',
        droppable && 'ck-time-slot--droppable',
        dragOver && 'ck-time-slot--drag-over',
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}

/* ── Event drawer helpers ───────────────────────────────────────────── */

function parseMinutes(time) {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesToTime(total) {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function addMinutesToTimeStr(time, mins) {
  return minutesToTime(parseMinutes(time) + mins)
}

function clampDuration(raw) {
  const n = Math.round(Number(raw) || 0)
  if (!Number.isFinite(n) || n <= 0) return 60
  return Math.min(480, Math.max(5, n))
}

function appointmentFormSeed(appt) {
  if (!appt) return null
  const dur = Math.max(0, parseMinutes(appt.end_time) - parseMinutes(appt.start_time)) || 60
  return {
    clientId: appt.client_id || '',
    modality: appt.therapy_modality || 'music_therapy',
    sessionDate: appt.session_date,
    start: appt.start_time || '09:00',
    end: appt.end_time || addMinutesToTimeStr(appt.start_time || '09:00', dur),
    durationStr: String(dur),
    location: appt.location || '',
    otherInfo: appointmentOtherInfo(appt),
    clinicianId: appt.clinician_id || '',
  }
}

function resolveBookingClinicianId({
  calendarOwner,
  selectedClient,
  sessionUserId,
  appointment,
  workplaceClinicians,
}) {
  if (appointment?.clinician_id) return appointment.clinician_id
  if (calendarOwner && calendarOwner !== CALENDAR_OWNER_ALL && calendarOwner !== CALENDAR_OWNER_ALL_TEAM) {
    return calendarOwner
  }
  if (selectedClient?.user_id) return selectedClient.user_id
  return workplaceClinicians[0]?.id || sessionUserId
}

function timesOverlap(aStart, aEnd, bStart, bEnd) {
  const a0 = parseMinutes(aStart)
  const a1 = parseMinutes(aEnd || aStart)
  const b0 = parseMinutes(bStart)
  const b1 = parseMinutes(bEnd || bStart)
  return a0 < b1 && b0 < a1
}

export function resolveEventKind(appointment) {
  if (!appointment) return 'standard'
  if (appointment.is_busy || appointment.appointment_type === 'busy') return 'busy'
  if (appointment.appointment_type === 'group') return 'group'
  return 'standard'
}

export function findAppointmentConflicts(appointment, allAppointments = []) {
  if (!appointment) return []
  return allAppointments.filter(a =>
    a.id !== appointment.id
    && a.session_date === appointment.session_date
    && (a.clinician_id === appointment.clinician_id || a.assigned_therapist === appointment.assigned_therapist)
    && timesOverlap(a.start_time, a.end_time, appointment.start_time, appointment.end_time),
  )
}

const GROUP_ATTENDEES_DEMO = {
  'appt-4': [
    { id: 'client-1', name: 'Alex Johnson', attendance: null, invoice: 'draft' },
    { id: 'client-3', name: 'Jordan Lee', attendance: 'attended', invoice: 'sent' },
    { id: 'client-5', name: 'Sam Rivera', attendance: 'did_not_attend', invoice: 'draft' },
  ],
}

const BUSY_COLORS = ['#557a61', '#e04f36', '#3a9fbf', '#7c4daf', '#7b8a99', '#2d3439']

function invoiceTag(status) {
  if (status === 'finalized' || status === 'final') return <DataTag variant="final">Finalized</DataTag>
  if (status === 'sent') return <DataTag variant="sent">Invoiced</DataTag>
  return <DataTag variant="draft">Draft</DataTag>
}

function EventDrawerActions({ onEdit, onBookAnother, onRecurring, locked = false, kind = 'standard' }) {
  if (kind === 'busy') {
    return (
      <section className="ck-event-drawer__actions">
        <button type="button" className="secondary" onClick={onEdit} disabled={locked}>
          Edit block
        </button>
      </section>
    )
  }

  return (
    <section className="ck-event-drawer__actions">
      <button type="button" className="primary" onClick={onEdit} disabled={locked}>
        Edit
      </button>
      <button type="button" className="secondary" onClick={onBookAnother}>
        Book another
      </button>
      <button type="button" className="secondary" onClick={onRecurring}>
        Recurring
      </button>
    </section>
  )
}

const ATTENDANCE_OPTIONS = ['attended', 'did_not_attend', 'cancelled']

export function AttendanceMarking({ value, onChange, locked = false, compact = false }) {
  if (compact) {
    return (
      <div className="ck-attendance-row">
        <label htmlFor="drawer-attendance" className="ck-attendance-row__label">Attendance</label>
        <select
          id="drawer-attendance"
          className="paper-input ck-attendance-row__select"
          value={value || ''}
          disabled={locked}
          onChange={e => onChange?.(e.target.value || null)}
        >
          <option value="">Not recorded</option>
          {ATTENDANCE_OPTIONS.map(status => (
            <option key={status} value={status}>{attendanceLabel(status)}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <section className="ck-event-drawer__section">
      <h3 className="ck-event-drawer__section-title">Mark attendance</h3>
      <p className="text-small text-muted ck-attendance-hint">
        {value ? `Logged as ${attendanceLabel(value)}` : 'Record attendance after the session'}
      </p>
      <div className="attendance-actions">
        {ATTENDANCE_OPTIONS.map(status => (
          <button
            key={status}
            type="button"
            disabled={locked}
            className={`attendance-actions__btn attendance-actions__btn--${status.replace(/_/g, '-')}${value === status ? ' attendance-actions__btn--active' : ''}`}
            onClick={() => onChange?.(status)}
          >
            {attendanceLabel(status)}
          </button>
        ))}
        {value && !locked && (
          <button type="button" className="secondary attendance-actions__clear" onClick={() => onChange?.(null)}>
            Clear
          </button>
        )}
      </div>
    </section>
  )
}

function StandardEventBody({ appointment, locked, onAttendanceChange }) {
  const linkedNote = getProgressNoteByAppointment(appointment.id)
  const noteHref = appointment.client_id
    ? `/clients/${appointment.client_id}/progress-notes?appointment=${appointment.id}`
    : null
  const apptHref = appointment.client_id
    ? `/clients/${appointment.client_id}/appointments/${appointment.id}`
    : null
  const timeRange = appointment.end_time
    ? `${appointment.start_time}–${appointment.end_time}`
    : appointment.start_time
  const duration = appointment.end_time
    ? `${Math.max(0, parseMinutes(appointment.end_time) - parseMinutes(appointment.start_time))} min`
    : null

  return (
    <SafetyLock
      locked={locked}
      reason="This session is locked — invoice finalized or note signed off."
    >
      <section className="ck-event-drawer__section ck-event-drawer__section--compact">
        <StackedDataList className="ck-stacked-list--compact">
          <StackedDataRow
            icon="👤"
            label="Client"
            value={appointment.client_name}
            href={appointment.client_id ? `/clients/${appointment.client_id}` : undefined}
          />
          <StackedDataRow
            icon="🕐"
            label="When"
            value={`${appointment.session_date} · ${timeRange}`}
            meta={[duration, appointment.location].filter(Boolean).join(' · ')}
            href={apptHref}
          />
          <StackedDataRow
            icon="🎨"
            label="Modality"
            value={modalityLabel(appointment.therapy_modality)}
            meta={appointmentTypeLabel(appointment.appointment_type)}
            tags={invoiceTag(appointment.invoice_status || 'draft')}
          />
          {appointmentOtherInfo(appointment) && (
            <StackedDataRow
              icon="ℹ️"
              label="Other info"
              value={appointmentOtherInfo(appointment)}
            />
          )}
        </StackedDataList>
      </section>

      <AttendanceMarking
        value={appointment.attendance_status}
        onChange={onAttendanceChange}
        locked={locked}
        compact
      />

      {linkedNote || noteHref ? (
        <section className="ck-event-drawer__section ck-event-drawer__section--compact">
          <StackedDataList className="ck-stacked-list--compact">
            <StackedDataRow
              icon="📝"
              label="Note"
              value={linkedNote ? linkedNote.title : 'Add progress note'}
              href={noteHref}
              tags={linkedNote?.is_locked ? <DataTag variant="final">Locked</DataTag> : null}
            />
          </StackedDataList>
        </section>
      ) : null}
    </SafetyLock>
  )
}

function GroupEventBody({ appointment, locked }) {
  const attendees = appointment.group_attendees
    || GROUP_ATTENDEES_DEMO[appointment.id]
    || [{ id: appointment.client_id, name: appointment.client_name, attendance: appointment.attendance_status, invoice: 'draft' }]

  const [openId, setOpenId] = useState(attendees[0]?.id || null)

  return (
    <SafetyLock locked={locked} reason="Group session billing is finalized — edits are disabled.">
      <section className="ck-event-drawer__section">
        <h3 className="ck-event-drawer__section-title">Group session</h3>
        <StackedDataList>
          <StackedDataRow
            icon="👥"
            label="Attendees"
            value={`${attendees.length} participants`}
            meta={formatAppointmentDateTime(appointment)}
          />
        </StackedDataList>
      </section>

      <section className="ck-event-drawer__section">
        <h3 className="ck-event-drawer__section-title">Individual records</h3>
        <div className="ck-group-accordion">
          {attendees.map(person => {
            const isOpen = openId === person.id
            const noteHref = `/clients/${person.id}/progress-notes?appointment=${appointment.id}`
            return (
              <div key={person.id} className="ck-group-accordion__item">
                <button
                  type="button"
                  className="ck-group-accordion__trigger"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : person.id)}
                >
                  <span className="ck-group-accordion__name">{person.name}</span>
                  <span className="ck-stacked-row__tags">
                    {person.attendance
                      ? <DataTag variant="sent">{attendanceLabel(person.attendance)}</DataTag>
                      : <DataTag variant="draft">Pending</DataTag>}
                    {invoiceTag(person.invoice || 'draft')}
                  </span>
                </button>
                {isOpen && (
                  <div className="ck-group-accordion__panel">
                    <StackedDataList>
                      <StackedDataRow
                        icon="📝"
                        label="Progress note"
                        value="Open note workspace"
                        href={noteHref}
                      />
                      <StackedDataRow
                        icon="£"
                        label="Invoice"
                        value={person.invoice === 'sent' ? 'Sent to accounts' : 'Draft — not yet billed'}
                        tags={invoiceTag(person.invoice || 'draft')}
                      />
                    </StackedDataList>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </SafetyLock>
  )
}

function BusyEventBody({ appointment, locked }) {
  const [color, setColor] = useState(appointment.block_color || BUSY_COLORS[0])
  const [blockType, setBlockType] = useState(appointment.block_type || 'admin')

  return (
    <SafetyLock locked={locked} reason="This block is synced to payroll — contact admin to edit.">
      <section className="ck-event-drawer__section">
        <h3 className="ck-event-drawer__section-title">Practitioner busy time</h3>
        <StackedDataList>
          <StackedDataRow
            icon="🚫"
            label="Block"
            value={formatAppointmentDateTime(appointment)}
            meta={appointment.location || 'Internal — not client-facing'}
          />
        </StackedDataList>
      </section>

      <section className="ck-event-drawer__section">
        <h3 className="ck-event-drawer__section-title">Block type</h3>
        <select
          className="paper-input"
          value={blockType}
          onChange={e => setBlockType(e.target.value)}
          disabled={locked}
        >
          <option value="admin">Admin / paperwork</option>
          <option value="supervision">Supervision</option>
          <option value="travel">Travel</option>
          <option value="break">Break</option>
        </select>
      </section>

      <section className="ck-event-drawer__section">
        <h3 className="ck-event-drawer__section-title">Calendar colour</h3>
        <div className="ck-busy-controls" role="list">
          {BUSY_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={cx('ck-color-swatch', color === c && 'ck-color-swatch--active')}
              style={{ backgroundColor: c }}
              aria-label={`Set block colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              disabled={locked}
            />
          ))}
        </div>
      </section>
    </SafetyLock>
  )
}

/**
 * Polymorphic appointment drawer — standard, group, or busy practitioner blocks.
 * Embeds conflict/waitlist/financial banners and safety locks inline.
 */
export function EventDrawer({
  appointment,
  allAppointments = [],
  onClose,
  onAttendanceChange,
  onEdit,
  onBookAnother,
  onRecurring,
  locked: lockedProp,
  waitlistSuggestion,
  fundingWarning,
  className,
}) {
  const kind = resolveEventKind(appointment)
  const conflicts = useMemo(
    () => findAppointmentConflicts(appointment, allAppointments),
    [appointment, allAppointments],
  )

  const linkedNote = appointment ? getProgressNoteByAppointment(appointment.id) : null
  const locked = lockedProp ?? (
    appointment?.invoice_status === 'finalized'
    || Boolean(linkedNote?.is_locked)
  )

  if (!appointment) return null

  const title = kind === 'busy'
    ? 'Busy block'
    : kind === 'group'
      ? 'Group session'
      : appointment.client_name

  const subtitle = kind === 'busy'
    ? APPOINTMENT_TYPES[appointment.appointment_type] || 'Practitioner unavailable'
    : `${modalityLabel(appointment.therapy_modality)} · ${appointment.assigned_therapist}`

  return (
    <AccessoryPane
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      className={cx('ck-event-drawer', className)}
      bodyClassName="ck-event-drawer__body"
    >
      {conflicts.length > 0 && (
        <ContextBanner variant="conflict" title="Schedule conflict">
          Overlaps with {conflicts.length} other booking{conflicts.length === 1 ? '' : 's'} at this time
          ({conflicts.map(c => c.client_name || 'Busy').join(', ')}).
        </ContextBanner>
      )}

      {(waitlistSuggestion || conflicts.length > 0) && (
        <ContextBanner
          variant="waitlist"
          title="Waitlist match"
          actions={(
            <button type="button" className="secondary">
              Review waitlist
            </button>
          )}
        >
          {waitlistSuggestion || 'Taylor Brooks requested this slot — consider offering a cancellation fill.'}
        </ContextBanner>
      )}

      {(fundingWarning || appointment.funding_exceeded) && (
        <ContextBanner variant="financial" title="Funding boundary">
          {fundingWarning || 'This booking may exceed the client\'s current funding period allocation. Verify before confirming attendance.'}
        </ContextBanner>
      )}

      <EventDrawerActions
        kind={kind}
        locked={locked}
        onEdit={() => onEdit?.(appointment)}
        onBookAnother={() => onBookAnother?.(appointment)}
        onRecurring={() => onRecurring?.(appointment)}
      />

      {kind === 'group' && (
        <GroupEventBody appointment={appointment} locked={locked} />
      )}
      {kind === 'busy' && (
        <BusyEventBody appointment={appointment} locked={locked} />
      )}
      {kind === 'standard' && (
        <StandardEventBody
          appointment={appointment}
          locked={locked}
          onAttendanceChange={onAttendanceChange}
        />
      )}
    </AccessoryPane>
  )
}

/** Schedule, edit, or duplicate a session from the calendar. */
export function ScheduleSessionPanel({
  sessionDate: initialSessionDate,
  startTime,
  appointment = null,
  prefill = null,
  clients = [],
  allAppointments = [],
  sessionUserId,
  myWorkplace = null,
  calendarOwner = null,
  onSave,
  onCancel,
  saving = false,
  showDateField = false,
}) {
  const seed = appointmentFormSeed(appointment) || appointmentFormSeed(prefill)
  const isEdit = Boolean(appointment?.id)

  const workplaceClinicians = useMemo(
    () => (myWorkplace?.id ? getWorkplaceClinicians(myWorkplace.id) : []),
    [myWorkplace?.id],
  )

  const [query, setQuery] = useState('')
  const [clientId, setClientId] = useState(seed?.clientId || '')
  const [modality, setModality] = useState(seed?.modality || 'music_therapy')
  const [sessionDate, setSessionDate] = useState(seed?.sessionDate || initialSessionDate)
  const [start, setStart] = useState(seed?.start || startTime || '09:00')
  const [end, setEnd] = useState(seed?.end || addMinutesToTimeStr(startTime || '09:00', 60))
  const [durationStr, setDurationStr] = useState(seed?.durationStr || '60')
  const [location, setLocation] = useState(seed?.location || '')
  const [otherInfo, setOtherInfo] = useState(seed?.otherInfo || '')
  const [clinicianId, setClinicianId] = useState(seed?.clinicianId || sessionUserId || '')
  const [recurringWeekly, setRecurringWeekly] = useState(false)
  const [recurWeeks, setRecurWeeks] = useState(4)

  const appointmentServices = useMemo(() => getAppointmentOrgServices(), [])

  const [prevSlot, setPrevSlot] = useState(`${initialSessionDate}|${startTime}|${appointment?.id || ''}|${prefill?.id || ''}`)
  const slotKey = `${initialSessionDate}|${startTime}|${appointment?.id || ''}|${prefill?.id || ''}`
  if (slotKey !== prevSlot && !isEdit) {
    setPrevSlot(slotKey)
    const nextSeed = appointmentFormSeed(prefill)
    const dur = nextSeed ? nextSeed.durationStr : durationStr
    setSessionDate(nextSeed?.sessionDate || initialSessionDate)
    setStart(nextSeed?.start || startTime || '09:00')
    setEnd(nextSeed?.end || addMinutesToTimeStr(startTime || '09:00', clampDuration(dur)))
    if (nextSeed) {
      setClientId(nextSeed.clientId)
      setModality(nextSeed.modality)
      setDurationStr(nextSeed.durationStr)
      setLocation(nextSeed.location)
      setOtherInfo(nextSeed.otherInfo)
      setClinicianId(nextSeed.clinicianId)
    }
  }

  const selectedClient = clients.find(c => c.id === clientId)
  const showClinicianPicker = canAssignAppointmentClinician(myWorkplace, selectedClient)
    && workplaceClinicians.length > 0

  useEffect(() => {
    if (isEdit || !selectedClient || !showClinicianPicker) return
    const nextId = resolveBookingClinicianId({
      calendarOwner,
      selectedClient,
      sessionUserId,
      appointment: null,
      workplaceClinicians,
    })
    if (nextId) setClinicianId(nextId)
  }, [selectedClient?.id, calendarOwner, isEdit, showClinicianPicker, sessionUserId, workplaceClinicians])

  const durationMinutes = clampDuration(durationStr)

  const handleStartChange = (value) => {
    const currentDur = Math.max(0, parseMinutes(end) - parseMinutes(start))
    const dur = currentDur > 0 ? currentDur : durationMinutes
    setStart(value)
    setEnd(addMinutesToTimeStr(value, dur))
  }

  const handleEndChange = (value) => {
    setEnd(value)
    const diff = parseMinutes(value) - parseMinutes(start)
    if (diff > 0) setDurationStr(String(diff))
  }

  const handleDurationChange = (value) => {
    setDurationStr(value)
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) {
      setEnd(addMinutesToTimeStr(start, clampDuration(n)))
    }
  }

  const handleDurationBlur = (value) => {
    const n = clampDuration(value)
    setDurationStr(String(n))
    setEnd(addMinutesToTimeStr(start, n))
  }

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => {
      const hay = `${c.real_name || ''} ${c.first_name || ''} ${c.surname || ''} ${c.school || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [clients, query])

  const computedDuration = Math.max(0, parseMinutes(end) - parseMinutes(start))
  const finalDuration = computedDuration > 0 ? computedDuration : durationMinutes

  const draftAppointment = useMemo(() => ({
    id: appointment?.id || '__draft__',
    client_id: clientId,
    clinician_id: clinicianId,
    session_date: sessionDate,
    start_time: start,
    end_time: end,
  }), [appointment?.id, clientId, clinicianId, sessionDate, start, end])

  const conflictPool = useMemo(
    () => (appointment?.id ? allAppointments.filter(a => a.id !== appointment.id) : allAppointments),
    [allAppointments, appointment?.id],
  )

  const conflicts = useMemo(
    () => findAppointmentConflicts(draftAppointment, conflictPool),
    [draftAppointment, conflictPool],
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!clientId || finalDuration <= 0) return
    const bookDates = recurringWeekly && !isEdit
      ? Array.from({ length: recurWeeks }, (_, i) => addDaysYmd(sessionDate, i * 7))
      : undefined
    onSave?.({
      ...(appointment?.id ? { id: appointment.id } : {}),
      client_id: clientId,
      session_date: sessionDate,
      start_time: start,
      end_time: addMinutesToTimeStr(start, finalDuration),
      duration_minutes: finalDuration,
      therapy_modality: modality,
      location: location.trim(),
      other_info: otherInfo.trim(),
      clinician_id: showClinicianPicker ? clinicianId : sessionUserId,
      appointment_type: appointment?.appointment_type || prefill?.appointment_type || 'one_to_one',
      dates: bookDates,
    })
  }

  const panelTitle = isEdit ? 'Edit appointment' : prefill ? 'Book another session' : 'Schedule session'
  const showDate = showDateField || isEdit || Boolean(prefill)
  const sessionCount = recurringWeekly && !isEdit ? recurWeeks : 1

  return (
    <AccessoryPane
      title={panelTitle}
      subtitle={`${sessionDate} · ${start}–${end}`}
      onClose={onCancel}
      bodyClassName="ck-schedule-panel"
    >
      <form className="ck-schedule-form" onSubmit={handleSubmit}>
        {showDate && (
          <div className="form-group">
            <label htmlFor="schedule-date">Date</label>
            <input
              id="schedule-date"
              type="date"
              className="paper-input"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="schedule-client-search">Find client</label>
          <input
            id="schedule-client-search"
            type="search"
            className="paper-input"
            placeholder="Search your caseload…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="ck-schedule-client-list" role="listbox" aria-label="Assigned clients">
          {filteredClients.length === 0 && (
            <p className="text-small text-muted">No clients match — try another name or school.</p>
          )}
          {filteredClients.map(client => (
            <button
              key={client.id}
              type="button"
              role="option"
              aria-selected={clientId === client.id}
              className={`ck-schedule-client${clientId === client.id ? ' ck-schedule-client--active' : ''}`}
              onClick={() => setClientId(client.id)}
            >
              <span className="ck-schedule-client__name">{client.real_name}</span>
              <span className="ck-schedule-client__meta">
                {client.school || client.workplace_name || 'Caseload'}
              </span>
            </button>
          ))}
        </div>

        {selectedClient && (
          <p className="text-small ck-schedule-selected">
            Selected: <strong>{selectedClient.real_name}</strong>
          </p>
        )}

        <div className="form-group">
          <label htmlFor="schedule-modality">Service</label>
          <select
            id="schedule-modality"
            className="paper-input"
            value={modality}
            onChange={e => setModality(e.target.value)}
          >
            {appointmentServices.map(svc => (
              <option key={svc.id} value={svc.slug}>{svc.name}</option>
            ))}
          </select>
        </div>

        <div className="ck-schedule-times">
          <div className="form-group">
            <label htmlFor="schedule-start">Start</label>
            <input
              id="schedule-start"
              type="time"
              step={300}
              className="paper-input"
              value={start}
              onChange={e => handleStartChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="schedule-end">End</label>
            <input
              id="schedule-end"
              type="time"
              step={300}
              className="paper-input"
              value={end}
              onChange={e => handleEndChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="schedule-duration">Duration (min)</label>
            <input
              id="schedule-duration"
              type="number"
              inputMode="numeric"
              min={5}
              max={480}
              step={5}
              className="paper-input"
              value={durationStr}
              onChange={e => handleDurationChange(e.target.value)}
              onBlur={e => handleDurationBlur(e.target.value)}
            />
          </div>
        </div>
        <p className="text-small text-muted ck-schedule-times-hint">
          Adjust start, end, or duration — the other fields update automatically.
        </p>
        {computedDuration <= 0 && (
          <p className="text-small ck-schedule-warning">End time must be after the start time.</p>
        )}

        {conflicts.length > 0 && (
          <ContextBanner variant="conflict" title="Schedule overlap">
            This slot overlaps {conflicts.length} existing booking{conflicts.length === 1 ? '' : 's'}
            ({conflicts.map(c => c.client_name || 'Busy').join(', ')}). You can still book if intentional.
          </ContextBanner>
        )}

        <div className="form-group">
          <label htmlFor="schedule-location">Location</label>
          <input
            id="schedule-location"
            type="text"
            className="paper-input"
            placeholder="e.g. Oak Academy — music room"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="schedule-other-info">Other info</label>
          <textarea
            id="schedule-other-info"
            className="paper-input"
            rows={2}
            placeholder="e.g. Parent attending, room change, equipment needed"
            value={otherInfo}
            onChange={e => setOtherInfo(e.target.value)}
          />
          <p className="text-small text-muted">Shown on the calendar block for this session.</p>
        </div>

        {showClinicianPicker && (
          <div className="form-group">
            <label htmlFor="schedule-clinician">Book with</label>
            <select
              id="schedule-clinician"
              className="paper-input"
              value={clinicianId}
              onChange={e => setClinicianId(e.target.value)}
              required
            >
              {workplaceClinicians.map(clinician => (
                <option key={clinician.id} value={clinician.id}>{clinician.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {!isEdit && (
          <div className="ck-recurring-inline">
            <label className="ck-recurring-inline__toggle">
              <input
                type="checkbox"
                checked={recurringWeekly}
                onChange={e => setRecurringWeekly(e.target.checked)}
              />
              Repeat weekly
            </label>
            {recurringWeekly && (
              <div className="ck-recurring-inline__weeks">
                <label htmlFor="schedule-weeks">For</label>
                <input
                  id="schedule-weeks"
                  type="number"
                  min={2}
                  max={52}
                  className="paper-input"
                  value={recurWeeks}
                  onChange={e => setRecurWeeks(Math.min(52, Math.max(2, Number(e.target.value) || 2)))}
                />
                <span className="text-small text-muted">weeks starting {sessionDate}</span>
              </div>
            )}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="primary" disabled={!clientId || saving || finalDuration <= 0}>
            {saving ? 'Saving…' : conflicts.length > 0 && !isEdit ? `Book ${sessionCount} anyway` : isEdit ? 'Save changes' : sessionCount > 1 ? `Book ${sessionCount} sessions` : 'Book session'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AccessoryPane>
  )
}

/** Schedule one-off future or weekly recurring sessions from an existing appointment. */
export function RecurringSchedulePanel({
  source,
  onSave,
  onCancel,
  saving = false,
}) {
  const [pattern, setPattern] = useState('once')
  const [sessionDate, setSessionDate] = useState(() => addDaysYmd(source.session_date, 7))
  const [weeks, setWeeks] = useState(4)

  const duration = Math.max(0, parseMinutes(source.end_time) - parseMinutes(source.start_time)) || 60
  const timeLabel = `${source.start_time}–${source.end_time || addMinutesToTimeStr(source.start_time, duration)}`

  const dates = useMemo(() => {
    if (pattern === 'once') return [sessionDate]
    return Array.from({ length: weeks }, (_, i) => addDaysYmd(sessionDate, i * 7))
  }, [pattern, sessionDate, weeks])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave?.({
      dates,
      pattern,
      client_id: source.client_id,
      start_time: source.start_time,
      end_time: source.end_time || addMinutesToTimeStr(source.start_time, duration),
      duration_minutes: duration,
      therapy_modality: source.therapy_modality,
      location: source.location || '',
      other_info: source.other_info || appointmentOtherInfo(source),
      appointment_type: source.appointment_type || 'one_to_one',
      clinician_id: source.clinician_id,
    })
  }

  return (
    <AccessoryPane
      title="Recurring session"
      subtitle={`${source.client_name} · ${timeLabel}`}
      onClose={onCancel}
      bodyClassName="ck-schedule-panel"
    >
      <form className="ck-schedule-form" onSubmit={handleSubmit}>
        <p className="text-small text-muted ck-recurring-intro">
          Create additional sessions using the same client, time, and duration as this appointment.
        </p>

        <div className="ck-recurring-pattern" role="radiogroup" aria-label="Recurrence pattern">
          <label className={`ck-recurring-option${pattern === 'once' ? ' ck-recurring-option--active' : ''}`}>
            <input
              type="radio"
              name="recurrence"
              value="once"
              checked={pattern === 'once'}
              onChange={() => setPattern('once')}
            />
            <span className="ck-recurring-option__title">One-off future date</span>
            <span className="ck-recurring-option__desc text-small text-muted">Book a single session on a chosen date</span>
          </label>
          <label className={`ck-recurring-option${pattern === 'weekly' ? ' ck-recurring-option--active' : ''}`}>
            <input
              type="radio"
              name="recurrence"
              value="weekly"
              checked={pattern === 'weekly'}
              onChange={() => setPattern('weekly')}
            />
            <span className="ck-recurring-option__title">Weekly</span>
            <span className="ck-recurring-option__desc text-small text-muted">Same day and time each week</span>
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="recurring-start-date">{pattern === 'weekly' ? 'First session date' : 'Session date'}</label>
          <input
            id="recurring-start-date"
            type="date"
            className="paper-input"
            value={sessionDate}
            onChange={e => setSessionDate(e.target.value)}
            required
          />
        </div>

        {pattern === 'weekly' && (
          <div className="form-group">
            <label htmlFor="recurring-weeks">Number of weeks</label>
            <input
              id="recurring-weeks"
              type="number"
              min={2}
              max={52}
              className="paper-input"
              value={weeks}
              onChange={e => setWeeks(Math.min(52, Math.max(2, Number(e.target.value) || 2)))}
            />
          </div>
        )}

        <div className="ck-recurring-preview">
          <span className="ck-recurring-preview__label">Will create</span>
          <strong>{dates.length} session{dates.length === 1 ? '' : 's'}</strong>
          {dates.length <= 6 && (
            <span className="text-small text-muted"> — {dates.join(', ')}</span>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving || dates.length === 0}>
            {saving ? 'Booking…' : `Book ${dates.length} session${dates.length === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AccessoryPane>
  )
}

export default {
  WorkspaceLayout,
  StickyContextBar,
  ClinicalPaper,
  SplitWorkspace,
  AccessoryPane,
  StackedDataList,
  StackedDataRow,
  DataTag,
  ContextBanner,
  SafetyLock,
  CalendarWorkspaceFrame,
  CalendarTimeSlot,
  EventDrawer,
  AttendanceMarking,
  ScheduleSessionPanel,
  RecurringSchedulePanel,
  resolveEventKind,
  findAppointmentConflicts,
}
