import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useConfirm, useToast } from '../../components/ui'
import { useClientSession } from '../../lib/useClientSession'
import {
  useClientEpisodesQuery,
  useDischargeEpisodeMutation,
  useDeleteEpisodeMutation,
  useOpenEpisodeMutation,
  useReopenEpisodeMutation,
  useSetEpisodeAppointmentsMutation,
} from '../../lib/episodeQueries'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { useEpisodeReportsQuery, useSaveReportMutation } from '../../lib/reportQueries'
import { formatSessionDateTime } from '../../lib/appointmentUtils'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'

function formatDate(iso) {
  if (!iso) return '—'
  const date = String(iso).slice(0, 10)
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_LABELS = {
  active: 'Active',
  discharged: 'Discharged',
  paused: 'Paused',
}

function EpisodeAppointments({ episode, clientId, episodes }) {
  const toast = useToast()
  const overlay = useAppointmentOverlay()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)
  const saveMembership = useSetEpisodeAppointmentsMutation()
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState([])

  const primaries = appointments
    .filter((appt) => appt.client_id === clientId && !appt.parent_appointment_id)
    .sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || ''))
      || String(b.start_time || '').localeCompare(String(a.start_time || '')))
  const onThisEpisode = primaries.filter((appt) => appt.episode_id === episode.id)

  const episodeLabel = (episodeId) => {
    if (!episodeId || episodeId === episode.id) return ''
    const match = episodes.find((item) => item.id === episodeId)
    return match ? `Episode ${match.episode_number}` : 'Another episode'
  }

  const startEdit = () => {
    setPicked(onThisEpisode.map((appt) => appt.id))
    setEditing(true)
  }

  const toggle = (id) => {
    setPicked((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const save = async () => {
    try {
      await saveMembership.mutateAsync({
        clientId,
        episodeId: episode.id,
        appointmentIds: picked,
      })
      setEditing(false)
      toast.saved('Appointments saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save these appointments')
    }
  }

  return (
    <div className="episode-detail__section">
      <div className="episode-detail__reports-header">
        <h4>Appointments</h4>
        {editing ? (
          <div className="episode-detail__edit-actions">
            <button type="button" className="secondary" onClick={() => setEditing(false)} disabled={saveMembership.isPending}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={save} disabled={saveMembership.isPending}>
              Save
            </button>
          </div>
        ) : (
          <button type="button" className="secondary" onClick={startEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="episode-appointment-scroll" aria-label={editing ? 'All appointments' : 'Appointments on this episode'}>
        {editing ? (
          primaries.length === 0 ? (
            <p className="text-small text-muted">No appointments for this client yet.</p>
          ) : (
            <ul className="episode-appointment-list">
              {primaries.map((appt) => {
                const elsewhere = episodeLabel(appt.episode_id)
                return (
                  <li key={appt.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.includes(appt.id)}
                        onChange={() => toggle(appt.id)}
                      />
                      <span>{formatSessionDateTime(appt)}</span>
                      <span className="text-small text-muted">
                        {appt.service_name || 'Appointment'}{elsewhere ? ` · ${elsewhere}` : ''}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )
        ) : onThisEpisode.length === 0 ? (
          <p className="text-small text-muted">No appointments on this course yet.</p>
        ) : (
          <ul className="episode-appointment-list">
            {onThisEpisode.map((appt) => (
              <li key={appt.id}>
                <button type="button" className="episode-appointment-list__open" onClick={() => overlay.openView(appt)}>
                  <span>{formatSessionDateTime(appt)}</span>
                  <span className="text-small text-muted">{appt.service_name || 'Appointment'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EpisodeSection({ title, empty, newLabel }) {
  const toast = useToast()
  return (
    <div className="episode-detail__section">
      <div className="episode-detail__reports-header">
        <h4>{title}</h4>
        <button
          type="button"
          className="secondary"
          onClick={() => toast.info(`${newLabel} creation will connect to the backend.`)}
        >
          Add
        </button>
      </div>
      <p className="text-small text-muted">{empty}</p>
    </div>
  )
}

function EpisodeReports({ episode, clientId, userId, organizationId }) {
  const toast = useToast()
  const { data: reports = [], isPending } = useEpisodeReportsQuery(episode.id)
  const saveReport = useSaveReportMutation()
  const [draft, setDraft] = useState(null)
  const [edits, setEdits] = useState({})

  const rows = draft ? [...reports, draft] : reports

  const valueFor = (report) => edits[report.id] || {
    title: report.title || '',
    body: report.body || '',
    report_date: report.report_date || new Date().toISOString().slice(0, 10),
  }

  const update = (report, patch) => {
    const base = edits[report.id] || {
      title: report.title || '',
      body: report.body || '',
      report_date: report.report_date || new Date().toISOString().slice(0, 10),
    }
    setEdits((current) => ({
      ...current,
      [report.id]: { ...base, ...current[report.id], ...patch },
    }))
  }

  const save = async (report) => {
    const value = valueFor(report)
    try {
      const saved = await saveReport.mutateAsync({
        id: String(report.id).startsWith('draft-') ? null : report.id,
        clientId,
        episodeId: episode.id,
        userId,
        organizationId,
        title: value.title,
        body: value.body,
        reportDate: value.report_date,
      })
      setEdits((current) => {
        const next = { ...current }
        delete next[report.id]
        return next
      })
      if (String(report.id).startsWith('draft-')) setDraft(null)
      toast.saved(saved.title ? `Saved ${saved.title}` : 'Report saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save the report')
    }
  }

  return (
    <div className="episode-detail__section">
      <div className="episode-detail__reports-header">
        <h4>Reports</h4>
        <button
          type="button"
          className="secondary"
          onClick={() => setDraft({
            id: `draft-${crypto.randomUUID()}`,
            title: '',
            body: '',
            report_date: new Date().toISOString().slice(0, 10),
          })}
          disabled={Boolean(draft)}
        >
          Add
        </button>
      </div>
      {isPending && <p className="text-small text-muted">Loading reports…</p>}
      {!isPending && rows.length === 0 && (
        <p className="text-small text-muted">No reports on this course yet.</p>
      )}
      {rows.map((report) => {
        const value = valueFor(report)
        return (
          <form
            key={report.id}
            className="episode-report"
            onSubmit={(event) => {
              event.preventDefault()
              save(report)
            }}
          >
            <label>
              <span>Title</span>
              <input
                value={value.title}
                onChange={(event) => update(report, { title: event.target.value })}
              />
            </label>
            <label>
              <span>Date</span>
              <input
                type="date"
                value={String(value.report_date || '').slice(0, 10)}
                onChange={(event) => update(report, { report_date: event.target.value })}
              />
            </label>
            <label className="episode-report__body">
              <span>Report</span>
              <textarea
                rows={5}
                value={value.body}
                onChange={(event) => update(report, { body: event.target.value })}
              />
            </label>
            <button type="submit" className="primary" disabled={saveReport.isPending}>
              Save report
            </button>
          </form>
        )
      })}
    </div>
  )
}

export default function CaseHistoryPanel() {
  const { id: clientId } = useParams()
  const toast = useToast()
  const confirm = useConfirm()
  const { client, session } = useClientSession()
  const episodesQuery = useClientEpisodesQuery(clientId)
  const openEpisode = useOpenEpisodeMutation()
  const dischargeEpisode = useDischargeEpisodeMutation()
  const reopenEpisode = useReopenEpisodeMutation()
  const deleteEpisode = useDeleteEpisodeMutation()
  const episodes = episodesQuery.data || []
  const [selectedId, setSelectedId] = useState(null)
  const active = episodes.find((episode) => episode.status === 'active') || null
  const selected = episodes.find((episode) => episode.id === selectedId) || active || episodes[0] || null
  const userId = session?.user?.id

  const openNew = async () => {
    if (!clientId || !userId) {
      toast.error('Session unavailable — please refresh the page.')
      return
    }
    try {
      const opened = await openEpisode.mutateAsync({
        clientId,
        ownerId: userId,
        organizationId: client?.workplace_id || null,
      })
      setSelectedId(opened.id)
      toast.saved(`Episode ${opened.episode_number} opened`)
    } catch (err) {
      toast.error(err?.message || 'Could not open an episode')
    }
  }

  const discharge = async () => {
    if (!active || !clientId) return
    const ok = await confirm({
      title: `Discharge episode ${active.episode_number}?`,
      message: 'This closes the course. Appointments stay on it, and a Process Note can still be added from an appointment. You can reopen this course if the client returns.',
      confirmLabel: 'Discharge',
    })
    if (!ok) return
    try {
      const closed = await dischargeEpisode.mutateAsync({ episodeId: active.id, clientId })
      setSelectedId(closed.id)
      toast.saved(`Episode ${closed.episode_number} discharged`)
    } catch (err) {
      toast.error(err?.message || 'Could not discharge this episode')
    }
  }

  const reopen = async (episode) => {
    if (!episode || !clientId) return
    const blocking = active && active.id !== episode.id ? active : null
    const ok = await confirm({
      title: `Reopen episode ${episode.episode_number}?`,
      message: blocking
        ? `Episode ${blocking.episode_number} is still open. Discharge it and reopen this course? New appointments will join the reopened course.`
        : 'This course becomes the open episode again. New appointments will be scheduled onto it.',
      confirmLabel: 'Reopen',
    })
    if (!ok) return
    try {
      if (blocking) {
        await dischargeEpisode.mutateAsync({ episodeId: blocking.id, clientId })
      }
      const opened = await reopenEpisode.mutateAsync({ episodeId: episode.id, clientId })
      setSelectedId(opened.id)
      toast.saved(`Episode ${opened.episode_number} reopened`)
    } catch (err) {
      toast.error(err?.message || 'Could not reopen this episode')
    }
  }

  const remove = async (episode) => {
    if (!episode || !clientId) return
    const ok = await confirm({
      title: `Delete episode ${episode.episode_number}?`,
      message: 'This removes the course. Appointments stay on the client and come off this course. Process Notes and reports on this course are deleted.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const removed = await deleteEpisode.mutateAsync({ episodeId: episode.id, clientId })
      setSelectedId(null)
      toast.saved(`Episode ${removed.episode_number} deleted`)
    } catch (err) {
      toast.error(err?.message || 'Could not delete this episode')
    }
  }

  const headerActions = episodesQuery.isPending || episodesQuery.isError || active ? null : (
    <button
      type="button"
      className="primary"
      onClick={openNew}
      disabled={openEpisode.isPending}
    >
      Open new episode
    </button>
  )

  const episodeBusy = dischargeEpisode.isPending || reopenEpisode.isPending || deleteEpisode.isPending

  return (
    <div className="course-page">
      <header className="course-page__header">
        <div>
          <h2>Course</h2>
        </div>
        <div className="course-page__actions">{headerActions}</div>
      </header>
      {episodesQuery.isError && (
        <p className="text-small text-muted">Episodes could not be loaded. Refresh the page and try again.</p>
      )}
      {episodesQuery.isPending && (
        <p className="text-small text-muted">Loading episodes…</p>
      )}
      {!episodesQuery.isPending && episodes.length === 0 && (
        <p className="text-small text-muted">No episodes yet. Open a new episode, or book a client session and the first course opens with it.</p>
      )}
      {episodes.length > 0 && (
        <div className="course-page__body">
          <ul className="course-list" aria-label="Episodes">
            {episodes.map((episode) => (
              <li key={episode.id}>
                <button
                  type="button"
                  className={`course-list__item${selected?.id === episode.id ? ' course-list__item--selected' : ''}`}
                  onClick={() => setSelectedId(episode.id)}
                  aria-current={selected?.id === episode.id ? 'true' : undefined}
                >
                  <span>Episode {episode.episode_number}</span>
                  <span className={`badge ${episode.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
                    {STATUS_LABELS[episode.status] || episode.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <div className="episode-detail">
              <div className="episode-detail__header">
                <div className="episode-detail__title">
                  <h3>Episode {selected.episode_number}</h3>
                  <span className={`badge ${selected.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>
                <div className="episode-detail__actions">
                  {selected.status === 'active' && (
                    <button type="button" className="secondary" onClick={discharge} disabled={episodeBusy}>
                      Discharge
                    </button>
                  )}
                  {selected.status === 'discharged' && (
                    <button type="button" className="secondary" onClick={() => reopen(selected)} disabled={episodeBusy}>
                      Reopen
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => remove(selected)} disabled={episodeBusy}>
                    Delete
                  </button>
                </div>
              </div>
              <dl className="episode-detail__grid">
                <div>
                  <dt>Started</dt>
                  <dd>{formatDate(selected.start_date)}</dd>
                </div>
                <div>
                  <dt>Ended</dt>
                  <dd>{formatDate(selected.end_date)}</dd>
                </div>
              </dl>
              <EpisodeAppointments
                key={`appointments-${selected.id}`}
                episode={selected}
                clientId={clientId}
                episodes={episodes}
              />
              <EpisodeSection
                title="Forms"
                newLabel="Form"
                empty="No forms on this course yet."
              />
              <EpisodeSection
                title="Outcome measures"
                newLabel="Outcome measure"
                empty="No outcome measures on this course yet."
              />
              {userId && (
                <EpisodeReports
                  key={`reports-${selected.id}`}
                  episode={selected}
                  clientId={clientId}
                  userId={userId}
                  organizationId={client?.workplace_id || null}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
