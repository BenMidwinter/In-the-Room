import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import { usePermissions } from '../../lib/usePermissions'
import {
  getEpisodes,
  getProgressNoteByAppointment,
  getWorkplaceClinicians,
  getProfile,
  APPOINTMENT_TYPES,
} from '../../lib/store'
import {
  useAppointmentQuery,
  useSaveAppointmentMutation,
} from '../../lib/appointmentQueries'
import {
  appointmentSchedule,
  appointmentDurationMinutes,
  formatSessionDateTime,
  attendanceLabel,
  appointmentOtherInfo,
} from '../../lib/appointmentUtils'
import { addMinutesToTime } from '../../lib/dateArchitecture'
import { useToast } from '../../components/ui'

const ATTENDANCE_OPTIONS = ['attended', 'did_not_attend', 'cancelled']

function parseMinutes(time) {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function clampDuration(raw) {
  const n = Math.round(Number(raw) || 0)
  if (!Number.isFinite(n) || n <= 0) return 60
  return Math.min(480, Math.max(5, n))
}

export default function AppointmentEditor() {
  const { appointmentId } = useParams()
  const navigate = useNavigate()
  const { clientId, client, session } = useClientSession()
  const perms = usePermissions(client)
  const toast = useToast()
  const isNew = appointmentId === 'new'
  const appointmentQuery = useAppointmentQuery(appointmentId, { enabled: !isNew })
  const saveAppointmentMutation = useSaveAppointmentMutation()

  const episodes = useMemo(() => getEpisodes(clientId), [clientId])
  const base = `/clients/${clientId}/appointments`
  const notesBase = `/clients/${clientId}/progress-notes`

  const [sessionDate, setSessionDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [durationStr, setDurationStr] = useState('60')
  const [appointmentType, setAppointmentType] = useState('one_to_one')
  const [episodeId, setEpisodeId] = useState(episodes[0]?.id || '')
  const [location, setLocation] = useState('')
  const [otherInfo, setOtherInfo] = useState('')
  const [attendanceStatus, setAttendanceStatus] = useState(null)
  const [activeId, setActiveId] = useState(isNew ? null : appointmentId)
  const [linkedNote, setLinkedNote] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const clearError = (field) =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev))
  const [clinicianId, setClinicianId] = useState(session?.user?.id || '')

  const canPickClinician = perms.canAssignAppointmentClinician
  const workplaceClinicians = client?.workplace_id ? getWorkplaceClinicians(client.workplace_id) : []
  const durationMinutes = clampDuration(durationStr)

  useEffect(() => {
    if (isNew) {
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      setSessionDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
      setStartTime('09:00')
      setEndTime('10:00')
      setDurationStr('60')
      setAppointmentType('one_to_one')
      setEpisodeId(episodes[0]?.id || '')
      setLocation('')
      setOtherInfo('')
      setAttendanceStatus(null)
      setActiveId(null)
      setLinkedNote(null)
      if (canPickClinician) {
        const defaultId = client?.user_id || workplaceClinicians[0]?.id || session?.user?.id || ''
        setClinicianId(defaultId)
      } else {
        setClinicianId(session?.user?.id || '')
      }
      return
    }
    const appt = appointmentQuery.data
    if (!appt) return
    const sched = appointmentSchedule(appt)
    const dur = appointmentDurationMinutes(appt)
    setSessionDate(sched.session_date)
    setStartTime(appt.start_time || sched.start_time || '09:00')
    setEndTime(appt.end_time || addMinutesToTime(appt.start_time || '09:00', dur))
    setDurationStr(String(dur))
    setAppointmentType(appt.appointment_type)
    setEpisodeId(appt.episode_id || '')
    setLocation(appt.location || '')
    setOtherInfo(appt.other_info || appointmentOtherInfo(appt))
    setAttendanceStatus(appt.attendance_status)
    setActiveId(appt.id)
    setClinicianId(appt.clinician_id || session?.user?.id || '')
    setLinkedNote(getProgressNoteByAppointment(appt.id))
  }, [appointmentId, isNew, appointmentQuery.data, clientId, canPickClinician, client?.user_id, client?.workplace_id, session?.user?.id, episodes])

  useEffect(() => {
    if (activeId) {
      setLinkedNote(getProgressNoteByAppointment(activeId))
    }
  }, [activeId, attendanceStatus])

  const handleStartChange = (value) => {
    const currentDur = Math.max(0, parseMinutes(endTime) - parseMinutes(startTime))
    const dur = currentDur > 0 ? currentDur : durationMinutes
    setStartTime(value)
    setEndTime(addMinutesToTime(value, dur))
  }

  const handleEndChange = (value) => {
    setEndTime(value)
    const diff = parseMinutes(value) - parseMinutes(startTime)
    if (diff > 0) setDurationStr(String(diff))
  }

  const handleDurationChange = (value) => {
    setDurationStr(value)
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) {
      setEndTime(addMinutesToTime(startTime, clampDuration(n)))
    }
  }

  const handleDurationBlur = (value) => {
    const n = clampDuration(value)
    setDurationStr(String(n))
    setEndTime(addMinutesToTime(startTime, n))
  }

  const computedDuration = Math.max(0, parseMinutes(endTime) - parseMinutes(startTime))
  const finalDuration = computedDuration > 0 ? computedDuration : durationMinutes

  const persistAppointment = async () => {
    const saved = await saveAppointmentMutation.mutateAsync({
      payload: {
        id: activeId || undefined,
        client_id: clientId,
        episode_id: episodeId || null,
        clinician_id: clinicianId || session.user.id,
        session_date: sessionDate,
        start_time: startTime,
        end_time: addMinutesToTime(startTime, finalDuration),
        duration_minutes: finalDuration,
        scheduled_at: `${sessionDate}T${startTime}:00`,
        appointment_type: appointmentType,
        attendance_status: attendanceStatus,
        location,
        other_info: otherInfo.trim(),
      },
      userId: session.user.id,
    })
    setActiveId(saved.id)
    setEndTime(saved.end_time || addMinutesToTime(saved.start_time, finalDuration))
    if (!isNew && appointmentId !== saved.id) {
      navigate(`${base}/${saved.id}`, { replace: true })
    }
    return saved
  }

  const handleSave = async () => {
    if (!session?.user?.id) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    const nextErrors = {}
    if (!sessionDate) nextErrors.sessionDate = 'Date is required.'
    if (finalDuration <= 0) nextErrors.duration = 'Duration must be greater than zero.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      await persistAppointment()
    } finally {
      setSaving(false)
    }
  }

  const handleProgressNote = async () => {
    if (!session?.user?.id || !perms.canWriteProgressNotes) return

    setSaving(true)
    try {
      const saved = await persistAppointment()
      const existing = getProgressNoteByAppointment(saved.id)
      if (existing) {
        navigate(`${notesBase}/${existing.id}`)
      } else {
        navigate(`${notesBase}/new?appointment=${saved.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const heading = isNew && !activeId
    ? 'New appointment'
    : formatSessionDateTime({ session_date: sessionDate, start_time: startTime })
  const showProgressNoteAction = attendanceStatus === 'attended' && perms.canWriteProgressNotes
  const assignedClinicianName = getProfile(clinicianId)?.full_name || 'Unassigned'

  return (
    <div className="client-panel appointment-editor">
      <div className="record-module__header">
        <div className="record-module__header-text">
          <h2 className="record-module__title">{heading}</h2>
          <p className="record-module__subtitle">
            {isNew && !activeId ? 'Schedule a session for this client.' : 'Update date, time, attendance, and location.'}
          </p>
        </div>
        <div className="record-module__actions">
          <button type="button" className="secondary" onClick={() => navigate(base)}>All appointments</button>
          <button type="button" className="primary" onClick={handleSave} disabled={saving || finalDuration <= 0}>
            {saving ? 'Saving…' : 'Save appointment'}
          </button>
        </div>
      </div>

      <div className="card appointment-form">
        {errors.form && (
          <p className="form-error" role="alert" style={{ marginBottom: '1rem' }}>{errors.form}</p>
        )}
        <div className="form-grid appointment-form__grid">
          <div className="form-group">
            <label htmlFor="appt-date">Date</label>
            <input
              id="appt-date"
              type="date"
              className="paper-input"
              value={sessionDate}
              onChange={e => { setSessionDate(e.target.value); clearError('sessionDate') }}
              aria-invalid={!!errors.sessionDate}
              required
            />
            {errors.sessionDate && <p className="mt-1 text-[0.8rem] text-secondary">{errors.sessionDate}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="appt-type">Appointment type</label>
            <select id="appt-type" className="paper-input" value={appointmentType} onChange={e => setAppointmentType(e.target.value)}>
              {Object.entries(APPOINTMENT_TYPES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ck-schedule-times appointment-form__times">
          <div className="form-group">
            <label htmlFor="appt-start">Start</label>
            <input
              id="appt-start"
              type="time"
              step={300}
              className="paper-input"
              value={startTime}
              onChange={e => handleStartChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="appt-end">End</label>
            <input
              id="appt-end"
              type="time"
              step={300}
              className="paper-input"
              value={endTime}
              onChange={e => handleEndChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="appt-duration">Duration (min)</label>
            <input
              id="appt-duration"
              type="number"
              min={5}
              max={480}
              step={5}
              className="paper-input"
              value={durationStr}
              onChange={e => { handleDurationChange(e.target.value); clearError('duration') }}
              onBlur={e => handleDurationBlur(e.target.value)}
              aria-invalid={!!errors.duration}
            />
            {errors.duration && <p className="mt-1 text-[0.8rem] text-secondary">{errors.duration}</p>}
          </div>
        </div>
        {computedDuration <= 0 && !errors.duration && (
          <p className="text-small ck-schedule-warning">End time must be after the start time.</p>
        )}

        <div className="form-grid appointment-form__grid">
          <div className="form-group">
            <label htmlFor="appt-episode">Case (episode)</label>
            <select id="appt-episode" className="paper-input" value={episodeId} onChange={e => setEpisodeId(e.target.value)}>
              <option value="">No case linked</option>
              {episodes.map(ep => (
                <option key={ep.id} value={ep.id}>
                  Episode {ep.episode_number} — {ep.presenting_issue?.slice(0, 50) || 'Care episode'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="appt-clinician">Clinician</label>
            {canPickClinician ? (
              <select id="appt-clinician" className="paper-input" value={clinicianId} onChange={e => setClinicianId(e.target.value)} required>
                {workplaceClinicians.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            ) : (
              <input
                id="appt-clinician"
                className="paper-input"
                value={assignedClinicianName}
                readOnly
                aria-readonly="true"
              />
            )}
            {!canPickClinician && (
              <p className="text-small text-muted" style={{ marginTop: '0.35rem' }}>
                Follow-up appointments are scheduled on your calendar.
              </p>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="appt-location">Location</label>
          <input
            id="appt-location"
            className="paper-input"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Oak Academy — music room"
          />
        </div>

        <div className="form-group">
          <label htmlFor="appt-other-info">Other info</label>
          <textarea
            id="appt-other-info"
            className="paper-input"
            rows={2}
            value={otherInfo}
            onChange={e => setOtherInfo(e.target.value)}
            placeholder="e.g. Parent attending, room change, equipment needed"
          />
          <p className="text-small text-muted" style={{ marginTop: '0.35rem' }}>
            Shown on the calendar block for this session.
          </p>
        </div>

        <div className="form-group appointment-form__attendance">
          <label htmlFor="appt-attendance">Attendance</label>
          <select
            id="appt-attendance"
            className="paper-input"
            value={attendanceStatus || ''}
            onChange={e => setAttendanceStatus(e.target.value || null)}
          >
            <option value="">Not recorded</option>
            {ATTENDANCE_OPTIONS.map(status => (
              <option key={status} value={status}>{attendanceLabel(status)}</option>
            ))}
          </select>
        </div>

        {showProgressNoteAction && (
          <div className="appointment-note-link">
            <div>
              <p className="appointment-note-link__title">Session documentation</p>
              <p className="text-small text-muted">
                {linkedNote
                  ? 'A progress note is linked to this appointment.'
                  : 'Record clinical notes for this attended session.'}
              </p>
            </div>
            <button
              type="button"
              className="primary"
              onClick={handleProgressNote}
              disabled={saving}
            >
              {linkedNote ? 'View progress note' : '+ Add progress note'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
