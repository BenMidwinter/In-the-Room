import { useState } from 'react'
import { useParams } from 'react-router-dom'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
import { useClientSession } from '../../lib/useClientSession'
import {
  useAssignAppointmentsMutation,
  useClientEpisodesQuery,
  useDischargeEpisodeMutation,
  useOpenEpisodeMutation,
} from '../../lib/episodeQueries'
import { useClientAppointmentsQuery } from '../../lib/appointmentQueries'
import { useEpisodeReportsQuery, useSaveReportMutation } from '../../lib/reportQueries'
import { formatSessionDateTime } from '../../lib/appointmentUtils'

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

const EPISODE_COLUMNS = [
  { key: 'episode', label: 'Episode' },
  { key: 'start', label: 'Started' },
  { key: 'end', label: 'Ended' },
  { key: 'status', label: 'Status', filter: { type: 'select', allLabel: 'All statuses' } },
]

function EpisodeAppointments({ episode, clientId, episodes }) {
  const toast = useToast()
  const { data: appointments = [] } = useClientAppointmentsQuery(clientId)
  const assign = useAssignAppointmentsMutation()
  const [picked, setPicked] = useState([])

  const primaries = appointments
    .filter((appt) => appt.client_id === clientId && !appt.parent_appointment_id)
    .sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || ''))
      || String(b.start_time || '').localeCompare(String(a.start_time || '')))
  const onThisEpisode = primaries.filter((appt) => appt.episode_id === episode.id)
  const available = primaries.filter((appt) => appt.episode_id !== episode.id)

  const episodeLabel = (episodeId) => {
    if (!episodeId) return 'Unassigned'
    const match = episodes.find((item) => item.id === episodeId)
    return match ? `Episode ${match.episode_number}` : 'Another episode'
  }

  const toggle = (id) => {
    setPicked((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const add = async () => {
    try {
      const moved = await assign.mutateAsync({
        clientId,
        episodeId: episode.id,
        appointmentIds: picked,
      })
      setPicked([])
      toast.saved(moved.length === 1
        ? 'Appointment added to this episode'
        : `${moved.length} appointments added to this episode`)
    } catch (err) {
      toast.error(err?.message || 'Could not add those appointments')
    }
  }

  return (
    <div className="episode-detail__appointments">
      <div className="episode-detail__reports-header">
        <h4>Appointments</h4>
        <button
          type="button"
          className="primary"
          onClick={add}
          disabled={!picked.length || assign.isPending}
        >
          Add to this episode
        </button>
      </div>
      <p className="text-small text-muted episode-detail__hint">
        Tick sessions to put them on this course. A Process Note stays with its appointment.
      </p>
      {onThisEpisode.length > 0 && (
        <ul className="episode-appointment-list">
          {onThisEpisode.map((appt) => (
            <li key={appt.id}>
              <span>{formatSessionDateTime(appt)}</span>
              <span className="text-small text-muted">{appt.service_name || 'Appointment'}</span>
            </li>
          ))}
        </ul>
      )}
      {available.length === 0 ? (
        <p className="text-small text-muted">No other appointments to add.</p>
      ) : (
        <ul className="episode-appointment-list">
          {available.map((appt) => (
            <li key={appt.id}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.includes(appt.id)}
                  onChange={() => toggle(appt.id)}
                />
                <span>{formatSessionDateTime(appt)}</span>
                <span className="text-small text-muted">
                  {appt.service_name || 'Appointment'} · {episodeLabel(appt.episode_id)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
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
    <div className="episode-detail__reports">
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
          Add report
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
  const episodes = episodesQuery.data || []
  const [selectedId, setSelectedId] = useState(null)
  const selected = episodes.find((episode) => episode.id === selectedId) || episodes[0] || null
  const active = episodes.find((episode) => episode.status === 'active') || null
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
      message: 'This closes the course. Sessions and notes stay on the record, and you can still add a Process Note or a report to this episode afterwards.',
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

  const headerActions = episodesQuery.isPending || episodesQuery.isError ? null : active ? (
    <button
      type="button"
      className="secondary"
      onClick={discharge}
      disabled={dischargeEpisode.isPending}
    >
      Discharge
    </button>
  ) : (
    <button
      type="button"
      className="primary"
      onClick={openNew}
      disabled={openEpisode.isPending}
    >
      Open new episode
    </button>
  )

  const rows = episodes.map((episode) => ({
    id: episode.id,
    muted: episode.status === 'discharged',
    filterValues: {
      status: STATUS_LABELS[episode.status] || episode.status,
    },
    cells: {
      episode: <span className="record-table__primary">Episode {episode.episode_number}</span>,
      start: formatDate(episode.start_date),
      end: formatDate(episode.end_date),
      status: (
        <span className={`badge ${episode.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
          {STATUS_LABELS[episode.status] || episode.status}
        </span>
      ),
    },
  }))

  return (
    <RecordListLayout
      title="Case history"
      subtitle="Each course holds its appointments. A Process Note belongs to the appointment, and follows it onto the course."
      headerActions={headerActions}
      editor={selected && (
        <div className="card episode-detail">
          <div className="episode-detail__header">
            <h3>Episode {selected.episode_number}</h3>
            <span className={`badge ${selected.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
              {STATUS_LABELS[selected.status] || selected.status}
            </span>
          </div>
          {selected.status === 'discharged' && (
            <p className="episode-detail__banner">
              This course is closed. Its appointments stay here. Add a Process Note from the appointment if something was missed.
            </p>
          )}
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
    >
      {episodesQuery.isError && (
        <p className="text-small text-muted">Episodes could not be loaded. Refresh the page and try again.</p>
      )}
      <RecordTable
        columns={EPISODE_COLUMNS}
        rows={rows}
        emptyMessage={episodesQuery.isPending
          ? 'Loading episodes…'
          : 'No episodes yet. Open a new episode, or book a client session and the first course opens with it.'}
        onRowClick={(row) => setSelectedId(row.id)}
        selectedId={selected?.id}
      />
    </RecordListLayout>
  )
}
