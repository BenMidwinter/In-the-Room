import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  APPOINTMENT_TYPES,
  getWorkplaceClinicians,
} from '../lib/store'
import { useProgressNoteByAppointmentQuery } from '../lib/progressNoteQueries'
import { processNoteAppointmentStatus } from '../lib/progressNoteLifecycle'
import {
  formatAppointmentDateTime,
  attendanceLabel,
  attendanceBadgeClass,
  appointmentTypeLabel,
  appointmentOtherInfo,
} from '../lib/appointmentUtils'
import { modalityLabel } from '../lib/calendarConstants'
import { appointmentServiceLabel } from '../lib/calendarServiceStyles'
import { getBookableOrgServices } from '../lib/store'
import { db } from '../lib/data/collections'
import { addDaysYmd, formatDisplayDate } from '../lib/dateArchitecture'
import { canAssignAppointmentClinician } from '../lib/permissions'
import { listServices } from '../lib/supabase/servicesRepo'
import { isSupabaseConfigured } from '../lib/supabase/client'
import FormOverlay from './FormOverlay'
import { useToast } from './ui'
import { feePenceToInput, formatServiceFee, parseFeePounds } from '../lib/money'
import SeriesScopeDialog from './SeriesScopeDialog'
import {
  appointmentBelongsToSeries,
  countSeriesScope,
  newSeriesId,
} from '../lib/appointmentSeries'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/* ── Core workspace shell ─────────────────────────────────────────────── */

/** Full-height clinical workspace with optional sticky chrome + scroll region. */
export function WorkspaceLayout({ className, children, scroll = false, ...props }) {
  if (scroll) {
    return (
      <div className={cx('room-workspace', className)} {...props}>
        <div className="room-workspace__scroll">{children}</div>
      </div>
    )
  }
  return (
    <div className={cx('room-workspace', className)} {...props}>
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
      className={cx('room-sticky-bar', sub && 'room-sticky-bar--sub', className)}
      {...props}
    >
      {leading && <div className="room-sticky-bar__leading">{leading}</div>}
      {meta && <div className="room-sticky-bar__meta">{meta}</div>}
      {children}
      {trailing && <div className="room-sticky-bar__trailing">{trailing}</div>}
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
        'room-clinical-paper',
        variant === 'a4' && 'room-clinical-paper--a4',
        variant === 'optimal' && 'room-clinical-paper--optimal',
        flat && 'room-clinical-paper--flat',
        className,
      )}
      {...props}
    >
      <div className="room-clinical-paper__canvas">
        <div className="room-clinical-paper__sheet">{children}</div>
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
          'room-split',
          paneOpen && 'room-split--pane-open',
          paneSize === 'lg' && 'room-split--pane-lg',
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
        'room-split',
        paneOpen && 'room-split--pane-open',
        paneSize === 'lg' && 'room-split--pane-lg',
        className,
      )}
    >
      <div className={cx('room-split__main', mainClassName)}>{main}</div>
      {paneOpen && accessory && (
        <aside className={cx('room-split__accessory', accessoryClassName)} aria-label="Accessory panel">
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
    <div className={cx('room-accessory-pane', className)}>
      {(title || onClose) && (
        <div className="room-accessory-pane__head">
          <div>
            {title && <h2 className="room-accessory-pane__title">{title}</h2>}
            {subtitle && <p className="room-accessory-pane__subtitle">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              className="secondary room-accessory-pane__close"
              onClick={onClose}
              aria-label={closeLabel}
            >
              ✕
            </button>
          )}
        </div>
      )}
      <div className={cx('room-accessory-pane__body', bodyClassName)}>{children}</div>
    </div>
  )
}

/* ── Stacked data rows ────────────────────────────────────────────────── */

export function StackedDataList({ children, className, as: Tag = 'ul', ...props }) {
  return (
    <Tag className={cx('room-stacked-list', className)} {...props}>
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
      <div className="room-stacked-row__icon" aria-hidden>
        {icon}
      </div>
      <div className="room-stacked-row__body">
        {label && <span className="room-stacked-row__label">{label}</span>}
        {value && (
          href ? (
            <Link to={href} className="room-stacked-row__value">{value}</Link>
          ) : (
            <span className="room-stacked-row__value">{value}</span>
          )
        )}
        {meta && <span className="room-stacked-row__meta">{meta}</span>}
        {tags && <div className="room-stacked-row__tags">{tags}</div>}
        {children}
      </div>
    </>
  )

  return (
    <Tag className={cx('room-stacked-row', className)}>
      {body}
    </Tag>
  )
}

export function DataTag({ variant = 'draft', children, className }) {
  return (
    <span className={cx('room-tag', `room-tag--${variant}`, className)}>
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
    <div className={cx('room-context-banner', `room-context-banner--${variant}`, className)} role="status">
      {title && <p className="room-context-banner__title">{title}</p>}
      {children && <div className="room-context-banner__body">{children}</div>}
      {actions && <div className="room-context-banner__actions">{actions}</div>}
    </div>
  )
}

export function SafetyLock({ locked = false, reason, children, className }) {
  return (
    <div className={cx('room-safety-lock', locked && 'room-safety-lock--locked', className)}>
      {locked && reason && (
        <p className="room-safety-lock__overlay" role="note">{reason}</p>
      )}
      <div className="room-safety-lock__content">{children}</div>
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
      className={cx('room-calendar-frame', paneOpen && 'room-calendar-frame--pane-open', className)}
      style={style}
    >
      <div className={cx('room-calendar-frame__grid', gridClassName)}>{grid}</div>
      {paneOpen && accessory && (
        <aside className={cx('room-calendar-frame__accessory', accessoryClassName)} aria-label="Calendar context">
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
        'room-time-slot',
        droppable && 'room-time-slot--droppable',
        dragOver && 'room-time-slot--drag-over',
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

function servicesForBookingKind(list, kind) {
  if (kind === 'busy') return []
  return (list || []).filter((service) => {
    if (service.is_active === false) return false
    const type = service.service_type || 'appointment'
    if (kind === 'support') return type === 'support'
    if (kind === 'admin') return type === 'admin'
    return type === 'appointment'
  })
}

function appointmentFormSeed(appt) {
  if (!appt) return null
  const dur = Math.max(0, parseMinutes(appt.end_time) - parseMinutes(appt.start_time)) || 60
  return {
    clientId: appt.client_id || '',
    serviceId: appt.service_id || '',
    modality: appt.therapy_modality || 'music_therapy',
    sessionDate: appt.session_date,
    start: appt.start_time || '09:00',
    end: appt.end_time || addMinutesToTimeStr(appt.start_time || '09:00', dur),
    durationStr: String(dur),
    location: appt.location || '',
    otherInfo: appointmentOtherInfo(appt),
    clinicianId: appt.clinician_id || '',
    createMeetLink: Boolean(appt.create_meet_link || appt.meet_url),
    serviceName: appt.service_name || '',
  }
}

function hydrateOrgServices(services) {
  if (!Array.isArray(services) || !services.length) return
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
}

function resolveBookingClinicianId({
  calendarOwner,
  selectedClient,
  sessionUserId,
  appointment,
  workplaceClinicians,
}) {
  if (appointment?.clinician_id) return appointment.clinician_id
  if (calendarOwner) return calendarOwner
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
  if (
    appointment.is_busy
    || appointment.appointment_type === 'busy'
    || appointment.block_role === 'busy'
    || appointment.is_external_busy
  ) return 'busy'
  if (appointment.block_role === 'support' || appointment.block_role === 'admin') return 'support'
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

function EventDrawerActions({
  onEdit,
  onMove,
  onDelete,
  locked = false,
  kind = 'standard',
  onAddInvoice,
  addInvoiceLabel = 'Add invoice',
  addInvoicePending = false,
  showDoNotInvoice = false,
  doNotInvoiceOn = false,
  onToggleDoNotInvoice,
  onCustomPrice,
  customPriceOpen = false,
  customPriceInitial,
  onSaveCustomPrice,
  onClearCustomPrice,
}) {
  const editLabel = kind === 'busy' || kind === 'support' ? 'Edit block' : 'Edit'
  return (
    <section className="room-event-drawer__actions">
      {customPriceOpen && onSaveCustomPrice && (
        <CustomPriceFields
          initialPence={customPriceInitial}
          onSave={onSaveCustomPrice}
          onClear={onClearCustomPrice}
        />
      )}
      <div className="room-event-drawer__action-row">
        <button type="button" className="secondary" onClick={onEdit} disabled={locked}>
          {editLabel}
        </button>
        {onMove && (
          <button type="button" className="secondary" onClick={onMove} disabled={locked}>
            Move
          </button>
        )}
        {onDelete && (
          <button type="button" className="secondary" onClick={onDelete} disabled={locked}>
            Delete
          </button>
        )}
        {onAddInvoice && (
          <button type="button" className="secondary" disabled={addInvoicePending || locked} onClick={onAddInvoice}>
            {addInvoiceLabel}
          </button>
        )}
        {onCustomPrice && (
          <button
            type="button"
            className={`secondary${customPriceOpen ? ' appointment-card__do-not-invoice--on' : ''}`}
            aria-pressed={customPriceOpen}
            disabled={locked}
            onClick={onCustomPrice}
          >
            Custom price
          </button>
        )}
        {showDoNotInvoice && (
          <button
            type="button"
            className={`secondary appointment-card__do-not-invoice${doNotInvoiceOn ? ' appointment-card__do-not-invoice--on' : ''}`}
            disabled={locked}
            aria-pressed={doNotInvoiceOn}
            onClick={() => onToggleDoNotInvoice?.()}
          >
            Do not invoice
          </button>
        )}
      </div>
    </section>
  )
}

function CustomPriceFields({ initialPence, onSave, onClear }) {
  const toast = useToast()
  const [amount, setAmount] = useState(initialPence == null ? '' : feePenceToInput(initialPence))

  function onSubmit(event) {
    event.preventDefault()
    const parsed = parseFeePounds(amount)
    if (parsed.error || parsed.pence == null) {
      toast.error(parsed.error || 'Enter a price for this session.')
      return
    }
    onSave(parsed.pence)
  }

  return (
    <form className="appointment-card__custom" onSubmit={onSubmit}>
      <label>
        This session (£)
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="50.00" />
      </label>
      <button type="submit" className="secondary">Save price</button>
      <button type="button" className="secondary" onClick={onClear}>Use usual price</button>
    </form>
  )
}

const ATTENDANCE_OPTIONS = ['attended', 'did_not_attend', 'cancelled']

function noteBadgeClass(status) {
  if (status === 'Complete') return 'badge badge-green'
  if (status === 'Draft') return 'badge badge-blue'
  return 'badge badge-grey'
}

function noteActionDate(note) {
  if (!note) return ''
  const raw = note.status === 'signed_off'
    ? (note.signed_off_at || note.updated_at || note.created_at)
    : (note.updated_at || note.created_at)
  return formatDisplayDate(String(raw || '').slice(0, 10))
}

function AttendanceBadge({ value, onChange, locked = false }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  const choose = (status) => {
    onChange?.(status)
    setOpen(false)
  }

  return (
    <div className="appointment-card__attendance" ref={menuRef}>
      <span className="room-stacked-row__label">Attendance</span>
      <button
        type="button"
        className={`badge ${attendanceBadgeClass(value)}`}
        disabled={locked}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {attendanceLabel(value)}
      </button>
      {open && !locked && (
        <div className="appointment-card__attendance-menu" role="menu">
          {ATTENDANCE_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              className={`badge ${attendanceBadgeClass(status)}`}
              onClick={() => choose(status)}
            >
              {attendanceLabel(status)}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="badge badge-blue"
            onClick={() => choose(null)}
          >
            Not logged
          </button>
        </div>
      )}
    </div>
  )
}

export function AttendanceMarking({ value, onChange, locked = false, compact = false }) {
  if (compact) {
    return <AttendanceBadge value={value} onChange={onChange} locked={locked} />
  }

  return (
    <section className="room-event-drawer__section">
      <h3 className="room-event-drawer__section-title">Mark attendance</h3>
      <p className="text-small text-muted room-attendance-hint">
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

function ProcessNoteBadge({ appointment, note, pending, onClose }) {
  if (!appointment?.client_id) return null
  const noteHref = `/clients/${appointment.client_id}/progress-notes?appointment=${appointment.id}`
  const status = pending ? null : processNoteAppointmentStatus(note)
  const date = status && status !== 'Incomplete' ? noteActionDate(note) : ''
  const label = status ? [status, date].filter(Boolean).join(' · ') : '…'
  return (
    <div className="appointment-card__note">
      <span className="room-stacked-row__label">Process Note</span>
      <Link
        to={noteHref}
        className={status ? noteBadgeClass(status) : 'badge badge-grey'}
        onClick={() => onClose?.()}
      >
        {label}
      </Link>
    </div>
  )
}

function StandardEventBody({
  appointment,
  locked,
  onAttendanceChange,
  feeLabel = '',
  showAttendance = true,
  showProcessNote = false,
  linkedNote = null,
  notePending = false,
  onClose,
}) {
  const timeRange = appointment.end_time
    ? `${appointment.start_time}–${appointment.end_time}`
    : appointment.start_time
  const duration = appointment.end_time
    ? `${Math.max(0, parseMinutes(appointment.end_time) - parseMinutes(appointment.start_time))} min`
    : null
  const serviceLabel = appointment.service_name
    || appointmentServiceLabel(appointment.service_id || appointment.therapy_modality)

  return (
    <SafetyLock
      locked={locked}
      reason="This session is locked — invoice finalized or note signed off."
    >
      <section className="room-event-drawer__section room-event-drawer__section--compact">
        <StackedDataList className="room-stacked-list--compact">
          {!showAttendance && (
            <StackedDataRow
              icon="🕐"
              label="When"
              value={`${appointment.session_date} · ${timeRange}`}
              meta={[duration, appointment.location].filter(Boolean).join(' · ')}
            />
          )}
          <li className={cx('room-stacked-row', showProcessNote && 'appointment-card__service')}>
            {!showProcessNote && <div className="room-stacked-row__icon" aria-hidden>🎨</div>}
            <div className="room-stacked-row__body">
              <span className="room-stacked-row__label">Service</span>
              <span className="room-stacked-row__value">{serviceLabel}</span>
              <span className="room-stacked-row__meta">
                {showAttendance ? appointmentTypeLabel(appointment.appointment_type) : 'Follow-on block'}
                {feeLabel ? ` · ${feeLabel}` : ''}
              </span>
            </div>
            {showProcessNote && (
              <ProcessNoteBadge
                appointment={appointment}
                note={linkedNote}
                pending={notePending}
                onClose={onClose}
              />
            )}
          </li>
          {appointmentOtherInfo(appointment) && (
            <StackedDataRow
              icon="ℹ️"
              label="Other info"
              value={appointmentOtherInfo(appointment)}
            />
          )}
          {appointment.meet_url && (
            <li className="room-stacked-row">
              <div className="room-stacked-row__icon" aria-hidden>🎥</div>
              <div className="room-stacked-row__body">
                <span className="room-stacked-row__label">Meet</span>
                <a
                  className="room-stacked-row__value"
                  href={appointment.meet_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Join Google Meet
                </a>
              </div>
            </li>
          )}
        </StackedDataList>
      </section>

      {showAttendance && (
        <div className="appointment-card__invoice">
          <AttendanceMarking
            value={appointment.attendance_status}
            onChange={onAttendanceChange}
            locked={locked}
            compact
          />
        </div>
      )}
    </SafetyLock>
  )
}

function GroupEventBody({ appointment, locked }) {
  const attendees = appointment.group_attendees
    || GROUP_ATTENDEES_DEMO[appointment.id]
    || [{ id: appointment.client_id, name: appointment.client_name, attendance: appointment.attendance_status, invoice: 'draft' }]

  const [openId, setOpenId] = useState(attendees[0]?.id || null)

  return (
    <SafetyLock locked={locked} reason="This session is locked.">
      <section className="room-event-drawer__section">
        <h3 className="room-event-drawer__section-title">Group session</h3>
        <StackedDataList>
          <StackedDataRow
            icon="👥"
            label="Attendees"
            value={`${attendees.length} participants`}
            meta={formatAppointmentDateTime(appointment)}
          />
        </StackedDataList>
      </section>

      <section className="room-event-drawer__section">
        <h3 className="room-event-drawer__section-title">Individual records</h3>
        <div className="room-group-accordion">
          {attendees.map(person => {
            const isOpen = openId === person.id
            const noteHref = `/clients/${person.id}/progress-notes?appointment=${appointment.id}`
            return (
              <div key={person.id} className="room-group-accordion__item">
                <button
                  type="button"
                  className="room-group-accordion__trigger"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : person.id)}
                >
                  <span className="room-group-accordion__name">{person.name}</span>
                  <span className="room-stacked-row__tags">
                    {person.attendance
                      ? <DataTag variant="sent">{attendanceLabel(person.attendance)}</DataTag>
                      : <DataTag variant="draft">Pending</DataTag>}
                    {invoiceTag(person.invoice || 'draft')}
                  </span>
                </button>
                {isOpen && (
                  <div className="room-group-accordion__panel">
                    <StackedDataList>
                      <li className="room-stacked-row">
                        <Link to={noteHref} className="primary room-event-drawer__note-action">
                          Add Process Note
                        </Link>
                      </li>
                      <StackedDataRow
                        icon="£"
                        label="Invoice"
                        value={person.invoice === 'sent' ? 'Sent' : 'Draft'}
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
    <SafetyLock locked={locked} reason="This block is locked.">
      <section className="room-event-drawer__section">
        <h3 className="room-event-drawer__section-title">Practitioner busy time</h3>
        <StackedDataList>
          <StackedDataRow
            icon="🚫"
            label="Block"
            value={formatAppointmentDateTime(appointment)}
            meta={appointment.location || 'Internal — not client-facing'}
          />
        </StackedDataList>
      </section>

      <section className="room-event-drawer__section">
        <h3 className="room-event-drawer__section-title">Block type</h3>
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

      <section className="room-event-drawer__section">
        <h3 className="room-event-drawer__section-title">Calendar colour</h3>
        <div className="room-busy-controls" role="list">
          {BUSY_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={cx('room-color-swatch', color === c && 'room-color-swatch--active')}
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
 * Polymorphic appointment viewer — standard, group, or busy practitioner blocks.
 * Centred view modal. The side-rail accessory is retired.
 */
export function EventDrawer({
  appointment,
  allAppointments = [],
  onClose,
  onAttendanceChange,
  onToggleDoNotInvoice,
  feeLabel = '',
  onAddInvoice,
  addInvoiceLabel,
  addInvoicePending,
  onCustomPrice,
  customPriceOpen,
  customPriceInitial,
  onSaveCustomPrice,
  onClearCustomPrice,
  onEdit,
  onMove,
  onDelete,
  locked: lockedProp,
  className,
  presentation = 'overlay',
}) {
  const kind = resolveEventKind(appointment)
  const conflicts = useMemo(
    () => findAppointmentConflicts(appointment, allAppointments),
    [appointment, allAppointments],
  )

  const noteQuery = useProgressNoteByAppointmentQuery(appointment?.id, {
    enabled: Boolean(appointment?.id && appointment?.client_id),
  })
  const linkedNote = noteQuery.data ?? null
  const locked = lockedProp ?? (
    appointment?.invoice_status === 'finalized'
    || Boolean(linkedNote?.is_locked)
  )

  if (!appointment) return null

  const serviceLabel = appointment.service_name
    || appointmentServiceLabel(appointment.service_id || appointment.therapy_modality)
  const timeRange = appointment.end_time
    ? `${appointment.start_time}–${appointment.end_time}`
    : appointment.start_time
  const whenLine = [
    formatDisplayDate(appointment.session_date) || appointment.session_date,
    timeRange,
    appointment.location,
  ].filter(Boolean).join(' · ')
  const title = kind === 'busy'
    ? 'Busy block'
    : kind === 'support'
      ? serviceLabel
      : kind === 'group'
        ? 'Group session'
        : appointment.client_name

  const subtitle = kind === 'busy'
    ? APPOINTMENT_TYPES[appointment.appointment_type] || 'Practitioner unavailable'
    : kind === 'support'
      ? `${appointment.client_name || 'No client'} · ${whenLine}`
      : whenLine

  const body = (
    <>
      {conflicts.length > 0 && (
        <ContextBanner variant="conflict" title="Schedule conflict">
          Overlaps with {conflicts.length} other booking{conflicts.length === 1 ? '' : 's'} at this time
          ({conflicts.map(c => c.client_name || 'Busy').join(', ')}).
        </ContextBanner>
      )}

      {kind === 'group' && (
        <GroupEventBody appointment={appointment} locked={locked} />
      )}
      {kind === 'busy' && (
        <BusyEventBody appointment={appointment} locked={locked} />
      )}
      {(kind === 'standard' || kind === 'support') && (
        <StandardEventBody
          appointment={appointment}
          locked={locked}
          onAttendanceChange={onAttendanceChange}
          feeLabel={feeLabel}
          showAttendance={kind === 'standard'}
          showProcessNote={kind === 'standard'}
          linkedNote={linkedNote}
          notePending={Boolean(noteQuery.isPlaceholderData) || !noteQuery.isSuccess}
          onClose={onClose}
        />
      )}

      <EventDrawerActions
        kind={kind}
        locked={locked}
        onEdit={() => onEdit?.(appointment)}
        onMove={onMove ? () => onMove?.(appointment) : undefined}
        onDelete={onDelete ? () => onDelete?.(appointment) : undefined}
        onAddInvoice={kind === 'standard' || kind === 'support' ? onAddInvoice : undefined}
        addInvoiceLabel={addInvoiceLabel}
        addInvoicePending={addInvoicePending}
        showDoNotInvoice={kind === 'standard' && (appointment.attendance_status === 'cancelled' || appointment.attendance_status === 'did_not_attend')}
        doNotInvoiceOn={Boolean(appointment.do_not_invoice)}
        onToggleDoNotInvoice={onToggleDoNotInvoice}
        onCustomPrice={kind === 'standard' || kind === 'support' ? onCustomPrice : undefined}
        customPriceOpen={customPriceOpen}
        customPriceInitial={customPriceInitial}
        onSaveCustomPrice={onSaveCustomPrice}
        onClearCustomPrice={onClearCustomPrice}
      />
    </>
  )

  const clientHref = appointment.client_id ? `/clients/${appointment.client_id}` : ''
  const clientNameLink = clientHref ? (
    <Link to={clientHref} className="appointment-card__client-link" onClick={() => onClose?.()}>
      {appointment.client_name || 'Client'}
    </Link>
  ) : null
  const overlayTitle = kind === 'standard' && clientNameLink ? clientNameLink : title
  const overlayMeta = kind === 'support' && clientNameLink
    ? <>{clientNameLink}{' · '}{whenLine}</>
    : subtitle

  if (presentation === 'overlay') {
    return (
      <FormOverlay
        title={overlayTitle}
        eyebrow={kind === 'busy' ? 'Busy' : kind === 'support' ? 'Support activity' : kind === 'group' ? 'Group' : 'Appointment'}
        meta={overlayMeta}
        onClose={onClose}
        size="md"
      >
        <div className={cx('room-event-drawer', 'room-event-drawer--overlay', className)}>
          {body}
        </div>
      </FormOverlay>
    )
  }

  return (
    <AccessoryPane
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      className={cx('room-event-drawer', className)}
      bodyClassName="room-event-drawer__body"
    >
      {body}
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
  onDelete,
  onBookAnother,
  onScheduleMore,
  saving = false,
  deleting = false,
  showDateField = false,
  /** `pane` = calendar side accessory; `overlay` = centred modal editor */
  presentation = 'overlay',
  lockedClient = false,
  bookingKind = 'appointment',
  outsideAvailability = false,
  onChangeKind,
}) {
  const seed = appointmentFormSeed(appointment) || appointmentFormSeed(prefill)
  const isEdit = Boolean(appointment?.id)
  const inSeries = isEdit && appointmentBelongsToSeries(appointment, allAppointments)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [scopeAction, setScopeAction] = useState(null) // 'edit' | 'delete' | null

  const workplaceClinicians = useMemo(
    () => (myWorkplace?.id ? getWorkplaceClinicians(myWorkplace.id) : []),
    [myWorkplace?.id],
  )

  const [query, setQuery] = useState('')
  const [clientId, setClientId] = useState(seed?.clientId || '')
  const [serviceId, setServiceId] = useState(seed?.serviceId || '')
  const [modality, setModality] = useState(seed?.modality || '')
  const [sessionDate, setSessionDate] = useState(seed?.sessionDate || initialSessionDate)
  const [start, setStart] = useState(seed?.start || startTime || '09:00')
  const [end, setEnd] = useState(seed?.end || addMinutesToTimeStr(startTime || '09:00', 60))
  const [durationStr, setDurationStr] = useState(seed?.durationStr || '60')
  const [location, setLocation] = useState(seed?.location || '')
  const [otherInfo, setOtherInfo] = useState(seed?.otherInfo || '')
  const [clinicianId, setClinicianId] = useState(seed?.clinicianId || sessionUserId || '')
  const [recurringWeekly, setRecurringWeekly] = useState(false)
  const [recurWeeks, setRecurWeeks] = useState(4)
  const [createMeetLink, setCreateMeetLink] = useState(Boolean(seed?.createMeetLink))
  const [blockLabel, setBlockLabel] = useState(
    () => seed?.serviceName || (bookingKind === 'busy' ? 'Busy' : ''),
  )
  const [services, setServices] = useState(() => servicesForBookingKind(getBookableOrgServices(), bookingKind))
  const [servicesReady, setServicesReady] = useState(() => !isSupabaseConfigured() || bookingKind === 'busy')
  const [servicesError, setServicesError] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(() => Boolean(
    seed?.location || seed?.otherInfo || seed?.createMeetLink,
  ))

  useEffect(() => {
    let cancelled = false
    async function loadServices() {
      if (bookingKind === 'busy' || !isSupabaseConfigured()) {
        setServices(servicesForBookingKind(getBookableOrgServices(), bookingKind))
        setServicesReady(true)
        return
      }
      setServicesReady(false)
      try {
        const remote = await listServices()
        if (cancelled) return
        hydrateOrgServices(remote)
        setServices(servicesForBookingKind(remote, bookingKind))
        setServicesError(null)
      } catch (err) {
        if (!cancelled) {
          setServices(servicesForBookingKind(getBookableOrgServices(), bookingKind))
          setServicesError(err.message || 'Could not load services')
        }
      } finally {
        if (!cancelled) setServicesReady(true)
      }
    }
    loadServices()
    return () => { cancelled = true }
  }, [bookingKind])

  // Bind the service catalogue once loaded (prefer seed service / modality).
  useEffect(() => {
    if (!services.length || serviceId) return
    const bySlug = modality
      ? services.find((s) => s.slug === modality || s.id === modality)
      : null
    const next = bySlug || services[0]
    if (!next) return
    setServiceId(next.id)
    setModality(next.slug)
    if (!isEdit) {
      const dur = Number(next.default_duration_minutes) || 50
      setDurationStr(String(dur))
      setEnd(addMinutesToTimeStr(start, dur))
      setCreateMeetLink(Boolean(next.create_meet_link))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services])

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [services, serviceId],
  )

  const clientRequired = bookingKind === 'appointment' || bookingKind === 'support'
  const clientOptional = bookingKind === 'admin'
  const hideClient = bookingKind === 'busy'
  const blockRole = bookingKind === 'support'
    ? 'support'
    : bookingKind === 'admin'
      ? 'admin'
      : bookingKind === 'busy'
        ? 'busy'
        : 'client_session'
  const catalogueOptional = bookingKind === 'busy' || (servicesReady && services.length === 0)

  const applyService = (nextId) => {
    const next = services.find((s) => s.id === nextId)
    setServiceId(nextId)
    if (!next) return
    setModality(next.slug)
    const dur = Number(next.default_duration_minutes) || 50
    setDurationStr(String(dur))
    setEnd(addMinutesToTimeStr(start, dur))
    if (!next.create_meet_link) setCreateMeetLink(false)
    else setCreateMeetLink(true)
  }

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
      setServiceId(nextSeed.serviceId || '')
      setModality(nextSeed.modality)
      setDurationStr(nextSeed.durationStr)
      setLocation(nextSeed.location)
      setOtherInfo(nextSeed.otherInfo)
      setClinicianId(nextSeed.clinicianId)
      setCreateMeetLink(Boolean(nextSeed.createMeetLink))
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

  const durationMinutes = clampDuration(
    catalogueOptional
      ? durationStr
      : (selectedService?.default_duration_minutes || durationStr),
  )

  const handleStartChange = (value) => {
    setStart(value)
    setEnd(addMinutesToTimeStr(value, durationMinutes))
  }

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => {
      const hay = `${c.real_name || ''} ${c.first_name || ''} ${c.surname || ''} ${c.school || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [clients, query])

  const finalDuration = durationMinutes
  const computedEnd = addMinutesToTimeStr(start, finalDuration)

  const draftAppointment = useMemo(() => ({
    id: appointment?.id || '__draft__',
    client_id: clientId,
    clinician_id: clinicianId,
    session_date: sessionDate,
    start_time: start,
    end_time: computedEnd,
  }), [appointment?.id, clientId, clinicianId, sessionDate, start, computedEnd])

  const conflictPool = useMemo(
    () => (appointment?.id ? allAppointments.filter(a => a.id !== appointment.id) : allAppointments),
    [allAppointments, appointment?.id],
  )

  const conflicts = useMemo(
    () => findAppointmentConflicts(draftAppointment, conflictPool),
    [draftAppointment, conflictPool],
  )

  const buildPayload = () => {
    const bookDates = recurringWeekly && !isEdit
      ? Array.from({ length: recurWeeks }, (_, i) => addDaysYmd(sessionDate, i * 7))
      : undefined
    const seriesId = bookDates?.length > 1
      ? newSeriesId()
      : (appointment?.series_id || undefined)
    return {
      ...(appointment?.id ? { id: appointment.id } : {}),
      client_id: hideClient ? null : (clientId || null),
      session_date: sessionDate,
      start_time: start,
      end_time: computedEnd,
      duration_minutes: finalDuration,
      therapy_modality: selectedService?.slug || (bookingKind === 'busy' ? 'busy' : modality || 'music_therapy'),
      service_id: selectedService?.id || null,
      service_name: selectedService?.name || blockLabel.trim() || (bookingKind === 'busy' ? 'Busy' : undefined),
      series_id: seriesId || undefined,
      location: location.trim(),
      other_info: otherInfo.trim(),
      clinician_id: showClinicianPicker ? clinicianId : sessionUserId,
      appointment_type: appointment?.appointment_type || prefill?.appointment_type || 'one_to_one',
      create_meet_link: Boolean(createMeetLink && selectedService?.create_meet_link),
      block_role: blockRole,
      dates: bookDates,
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if ((clientRequired && !clientId) || finalDuration <= 0) return
    if (!catalogueOptional && !serviceId) return
    const payload = buildPayload()
    if (isEdit && inSeries) {
      setPendingPayload(payload)
      setScopeAction('edit')
      return
    }
    onSave?.(payload, 'this')
  }

  const handleDeleteClick = () => {
    if (!isEdit || !onDelete) return
    if (inSeries) {
      setPendingPayload(null)
      setScopeAction('delete')
      return
    }
    onDelete?.(appointment, 'this')
  }

  const panelTitle = isEdit
    ? (bookingKind === 'busy'
      ? 'Edit busy time'
      : bookingKind === 'support'
        ? 'Edit support activity'
        : bookingKind === 'admin'
          ? 'Edit admin'
          : 'Edit appointment')
    : prefill && bookingKind === 'appointment'
      ? 'Book another session'
      : (bookingKind === 'busy'
        ? 'Block busy time'
        : bookingKind === 'support'
          ? 'Schedule support activity'
          : bookingKind === 'admin'
            ? 'Schedule admin'
            : 'Schedule appointment')
  const panelEyebrow = bookingKind === 'busy'
    ? 'Busy'
    : bookingKind === 'support'
      ? 'Support activity'
      : bookingKind === 'admin'
        ? 'Admin'
        : 'Appointment'
  const showDate = showDateField || isEdit || Boolean(prefill)
  const sessionCount = recurringWeekly && !isEdit ? recurWeeks : 1
  const formBody = (
      <form className="room-schedule-form" onSubmit={handleSubmit}>
        {!isEdit && onChangeKind && (
          <button type="button" className="room-schedule-advanced-toggle" onClick={onChangeKind}>
            Change booking type
          </button>
        )}

        {bookingKind === 'busy' && (
          <p className="text-small text-muted room-schedule-times-hint">
            Blocks time you are unexpectedly unavailable. This can sit outside your usual availability.
          </p>
        )}
        {outsideAvailability && bookingKind !== 'busy' && (
          <p className="text-small room-schedule-warning">
            This time is outside your usual availability.
          </p>
        )}

        {!servicesReady && services.length === 0 && bookingKind !== 'busy' && (
          <p className="text-small text-muted">Loading services…</p>
        )}

        {services.length > 0 && (
        <div className="form-group">
          <label htmlFor="schedule-service">Service</label>
          <select
            id="schedule-service"
            className="paper-input"
            value={serviceId}
            onChange={e => applyService(e.target.value)}
            required
            disabled={!services.length}
          >
            {!services.length && <option value="">No services configured</option>}
            {services.map(svc => (
              <option key={svc.id} value={svc.id}>
                {svc.name}
                {svc.service_type && svc.service_type !== 'appointment' ? ` · ${svc.service_type}` : ''}
                {svc.fee_pence != null ? ` · ${formatServiceFee(svc.fee_pence, svc.fee_includes_vat)}` : ''}
                {' '}({svc.default_duration_minutes || 50} min)
              </option>
            ))}
          </select>
        </div>
        )}
        {servicesError && (
          <p className="text-small room-schedule-warning">{servicesError}</p>
        )}

        {catalogueOptional && (
          <>
            <div className="form-group">
              <label htmlFor="schedule-label">{bookingKind === 'busy' ? 'Label' : 'Name'}</label>
              <input
                id="schedule-label"
                type="text"
                className="paper-input"
                value={blockLabel}
                onChange={e => setBlockLabel(e.target.value)}
                placeholder={bookingKind === 'busy' ? 'Busy' : 'Name this block'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="schedule-duration">Duration (minutes)</label>
              <input
                id="schedule-duration"
                type="number"
                min={5}
                step={5}
                className="paper-input"
                value={durationStr}
                onChange={e => {
                  setDurationStr(e.target.value)
                  setEnd(addMinutesToTimeStr(start, clampDuration(e.target.value)))
                }}
              />
            </div>
          </>
        )}

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

        <div className="room-schedule-times room-schedule-times--start-only">
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
            <label>Ends</label>
            <p className="room-schedule-derived">
              <strong>{computedEnd}</strong>
              <span className="text-muted"> · {finalDuration} min{catalogueOptional ? '' : ' from service'}</span>
            </p>
          </div>
        </div>

        {!lockedClient && !hideClient && (
          <>
            <div className="form-group">
              <label htmlFor="schedule-client-search">
                {clientRequired ? 'Client' : 'Client (optional)'}
              </label>
              <input
                id="schedule-client-search"
                type="search"
                className="paper-input"
                placeholder={clientRequired ? 'Search caseload…' : 'Optional — search caseload…'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="room-schedule-client-list" role="listbox" aria-label="Assigned clients">
              {filteredClients.length === 0 && (
                <p className="text-small text-muted">No clients match — try another name or school.</p>
              )}
              {filteredClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={clientId === client.id}
                  className={`room-schedule-client${clientId === client.id ? ' room-schedule-client--active' : ''}`}
                  onClick={() => setClientId(client.id)}
                >
                  <span className="room-schedule-client__name">{client.real_name}</span>
                  <span className="room-schedule-client__meta">
                    {client.school || client.workplace_name || 'Caseload'}
                  </span>
                </button>
              ))}
            </div>
            {!clientRequired && clientId && (
              <button
                type="button"
                className="secondary room-schedule-clear-client"
                onClick={() => setClientId('')}
              >
                Clear client
              </button>
            )}
          </>
        )}

        {selectedClient && (
          <p className="text-small room-schedule-selected">
            {lockedClient ? 'Client' : 'Selected'}: <strong>{selectedClient.real_name}</strong>
          </p>
        )}
        {clientOptional && !selectedClient && (
          <p className="text-small text-muted room-schedule-selected">
            No client linked — this admin block can stand alone.
          </p>
        )}

        {conflicts.length > 0 && (
          <ContextBanner variant="conflict" title="Schedule overlap">
            This slot overlaps {conflicts.length} existing booking{conflicts.length === 1 ? '' : 's'}
            ({conflicts.map(c => c.client_name || 'Busy').join(', ')}). You can still book if intentional.
          </ContextBanner>
        )}

        <button
          type="button"
          className="room-schedule-advanced-toggle"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide details' : 'More details'}
        </button>

        {showAdvanced && (
          <div className="room-schedule-advanced">
            {selectedService?.create_meet_link && (
              <label className="room-schedule-meet">
                <input
                  type="checkbox"
                  checked={createMeetLink}
                  onChange={e => setCreateMeetLink(e.target.checked)}
                />
                <span>
                  Create Google Meet link
                  <span className="text-small text-muted"> — adds a Meet URL when you book</span>
                </span>
              </label>
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
              <div className="room-recurring-inline">
                <label className="room-recurring-inline__toggle">
                  <input
                    type="checkbox"
                    checked={recurringWeekly}
                    onChange={e => setRecurringWeekly(e.target.checked)}
                  />
                  Repeat weekly
                </label>
                {recurringWeekly && (
                  <div className="room-recurring-inline__weeks">
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
          </div>
        )}

        {isEdit && appointment && (onBookAnother || onScheduleMore) && (
          <section className="room-schedule-more">
            <h3 className="room-schedule-more__title">Schedule more</h3>
            <p className="text-small text-muted">Book follow-up sessions without leaving the editor.</p>
            <div className="room-schedule-more__actions">
              {onBookAnother && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onBookAnother(appointment)}
                  disabled={saving || deleting}
                >
                  Book next week
                </button>
              )}
              {onScheduleMore && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onScheduleMore(appointment)}
                  disabled={saving || deleting}
                >
                  Repeat series…
                </button>
              )}
            </div>
          </section>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="primary"
            disabled={(clientRequired && !clientId) || (!catalogueOptional && !serviceId) || saving || deleting || finalDuration <= 0}
          >
            {saving
              ? 'Saving…'
              : conflicts.length > 0 && !isEdit
                ? `Book ${sessionCount} anyway`
                : isEdit
                  ? 'Save changes'
                  : sessionCount > 1
                    ? `Book ${sessionCount} sessions`
                    : clientRequired
                      ? 'Book session'
                      : 'Book block'}
          </button>
          {isEdit && onDelete && (
            <button type="button" className="secondary" onClick={handleDeleteClick} disabled={saving || deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
  )

  const scopeDialog = scopeAction ? (
    <SeriesScopeDialog
      action={scopeAction}
      onCancel={() => { setScopeAction(null); setPendingPayload(null) }}
      countForScope={(scope) => countSeriesScope(appointment, allAppointments, scope)}
      onSelect={(scope) => {
        const action = scopeAction
        const payload = pendingPayload
        setScopeAction(null)
        setPendingPayload(null)
        if (action === 'delete') onDelete?.(appointment, scope)
        else if (payload) onSave?.(payload, scope)
      }}
    />
  ) : null

  if (presentation === 'overlay') {
    return (
      <>
        <FormOverlay
          title={panelTitle}
          eyebrow={panelEyebrow}
          meta={`${sessionDate} · ${start}–${computedEnd}`}
          onClose={onCancel}
          size="md"
        >
          <div className="room-schedule-panel">{formBody}</div>
        </FormOverlay>
        {scopeDialog}
      </>
    )
  }

  return (
    <>
      <AccessoryPane
        title={panelTitle}
        subtitle={`${panelEyebrow} · ${sessionDate} · ${start}–${computedEnd}`}
        onClose={onCancel}
        bodyClassName="room-schedule-panel"
      >
        {formBody}
      </AccessoryPane>
      {scopeDialog}
    </>
  )
}

/** Schedule one-off future or weekly recurring sessions from an existing appointment. */
export function RecurringSchedulePanel({
  source,
  onSave,
  onCancel,
  saving = false,
  presentation = 'overlay',
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
    const seriesId = dates.length > 1
      ? (source.series_id || newSeriesId())
      : source.series_id || undefined
    onSave?.({
      dates,
      pattern,
      client_id: source.client_id,
      start_time: source.start_time,
      end_time: source.end_time || addMinutesToTimeStr(source.start_time, duration),
      duration_minutes: duration,
      therapy_modality: source.therapy_modality,
      service_id: source.service_id,
      service_name: source.service_name,
      series_id: seriesId,
      location: source.location || '',
      other_info: source.other_info || appointmentOtherInfo(source),
      appointment_type: source.appointment_type || 'one_to_one',
      clinician_id: source.clinician_id,
      block_role: source.block_role || 'client_session',
    })
  }

  const formBody = (
    <form className="room-schedule-form" onSubmit={handleSubmit}>
      <p className="text-small text-muted room-recurring-intro">
        Create additional sessions using the same client, time, and duration as this appointment.
      </p>

      <div className="room-recurring-pattern" role="radiogroup" aria-label="Recurrence pattern">
        <label className={`room-recurring-option${pattern === 'once' ? ' room-recurring-option--active' : ''}`}>
          <input
            type="radio"
            name="recurrence"
            value="once"
            checked={pattern === 'once'}
            onChange={() => setPattern('once')}
          />
          <span className="room-recurring-option__title">One-off future date</span>
          <span className="room-recurring-option__desc text-small text-muted">Book a single session on a chosen date</span>
        </label>
        <label className={`room-recurring-option${pattern === 'weekly' ? ' room-recurring-option--active' : ''}`}>
          <input
            type="radio"
            name="recurrence"
            value="weekly"
            checked={pattern === 'weekly'}
            onChange={() => setPattern('weekly')}
          />
          <span className="room-recurring-option__title">Weekly</span>
          <span className="room-recurring-option__desc text-small text-muted">Same day and time each week</span>
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

      <div className="room-recurring-preview">
        <span className="room-recurring-preview__label">Will create</span>
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
  )

  if (presentation === 'overlay') {
    return (
      <FormOverlay
        title="Recurring session"
        eyebrow="Appointment"
        meta={`${source.client_name || 'Client'} · ${timeLabel}`}
        onClose={onCancel}
        size="md"
      >
        <div className="room-schedule-panel">{formBody}</div>
      </FormOverlay>
    )
  }

  return (
    <AccessoryPane
      title="Recurring session"
      subtitle={`${source.client_name} · ${timeLabel}`}
      onClose={onCancel}
      bodyClassName="room-schedule-panel"
    >
      {formBody}
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
