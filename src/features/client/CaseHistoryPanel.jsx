import { useEffect, useMemo, useState } from 'react'
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
import { attendanceLabel, formatSessionDateTime, isClientSessionAppointment } from '../../lib/appointmentUtils'
import RecordTable from '../../components/RecordTable'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import RichTextEditor from '../../components/RichTextEditor'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { buildMergeContext, clinicianProfileForEditor } from '../../lib/mergeFields'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useTemplatesQuery } from '../../lib/templateQueries'
import { getProfile } from '../../lib/store'
import { useClientChrome } from './ClientChrome'
import DocumentWorkspace from './DocumentWorkspace'
import { EpisodeForms, EpisodeOutcomes } from './CourseRecords'

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
  { key: 'episode', label: 'Episode', filter: 'text', sort: 'number' },
  { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
  { key: 'started', label: 'Started', sort: 'date' },
  { key: 'ended', label: 'Ended', sort: 'date' },
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

const APPOINTMENT_COLUMNS = [
  { key: 'when', label: 'When', filter: 'text', sort: 'date' },
  { key: 'service', label: 'Service', filter: 'text', sort: 'text' },
  { key: 'attendance', label: 'Attendance', filter: 'choice', sort: 'text' },
]

const REPORT_COLUMNS = [
  { key: 'title', label: 'Title', filter: 'text', sort: 'text' },
  { key: 'date', label: 'Date', sort: 'date' },
]

function CourseAccordion({ title, open, onToggle, actions, children }) {
  return (
    <section className={`course-accordion${open ? ' course-accordion--open' : ''}`}>
      <div className="course-accordion__bar">
        <button
          type="button"
          className="course-accordion__toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="course-accordion__mark" aria-hidden>{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {open ? actions : null}
      </div>
      {open ? <div className="course-accordion__body">{children}</div> : null}
    </section>
  )
}

function EpisodeAppointments({ episode, clientId, episodes, open, onToggle }) {
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
  const sessions = primaries.filter((appt) => isClientSessionAppointment(appt))
  const onThisEpisode = sessions.filter((appt) => appt.episode_id === episode.id)
  const keptWithCourse = primaries
    .filter((appt) => appt.episode_id === episode.id && !isClientSessionAppointment(appt))
    .map((appt) => appt.id)

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
        appointmentIds: [...picked, ...keptWithCourse],
      })
      setEditing(false)
      toast.saved('Appointments saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save these appointments')
    }
  }

  const listed = editing ? sessions : onThisEpisode
  const columns = editing
    ? [{ key: 'pick', label: '', sort: false, className: 'record-table__col--pick' }, ...APPOINTMENT_COLUMNS]
    : APPOINTMENT_COLUMNS
  const rows = listed.map((appt) => {
    const elsewhere = episodeLabel(appt.episode_id)
    const when = formatSessionDateTime(appt)
    const service = appt.service_name || 'Appointment'
    const attendance = attendanceLabel(appt.attendance_status)
    return {
      id: appt.id,
      appt,
      filterValues: {
        when,
        service: elsewhere ? `${service} ${elsewhere}` : service,
        attendance,
      },
      sortValues: {
        when: `${appt.session_date || ''} ${appt.start_time || ''}`,
        service,
        attendance,
      },
      cells: {
        pick: editing ? (
          <input
            type="checkbox"
            checked={picked.includes(appt.id)}
            onChange={() => toggle(appt.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Include ${when}`}
          />
        ) : null,
        when: <span className="record-table__primary">{when}</span>,
        service: elsewhere
          ? <>{service} <span className="record-table__cell-muted">· {elsewhere}</span></>
          : service,
        attendance,
      },
    }
  })

  return (
    <CourseAccordion
      title="Appointments"
      open={open}
      onToggle={onToggle}
      actions={editing ? (
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
    >
      <RecordTable
        columns={columns}
        rows={rows}
        scroll
        countNoun="appointments"
        defaultSort={{ key: 'when', direction: 'desc' }}
        emptyMessage={editing ? 'No appointments for this client yet.' : 'No appointments on this course yet.'}
        onRowClick={(row) => {
          if (editing) toggle(row.id)
          else overlay.openView(row.appt)
        }}
      />
    </CourseAccordion>
  )
}

function EpisodeReports({ episode, client, clientId, userId, organizationId, open, onToggle }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile: accountProfile } = useAuth()
  const { data: reportTemplates = [] } = useTemplatesQuery('report')
  const { data: reports = [], isPending } = useEpisodeReportsQuery(episode.id)
  const saveReport = useSaveReportMutation()
  const [openId, setOpenId] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('<p></p>')
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [editorVersion, setEditorVersion] = useState(0)
  const setEditorOpen = useClientChrome()?.setEditorOpen
  const clinicianProfile = useMemo(
    () => clinicianProfileForEditor(accountProfile, userId ? getProfile(userId) : null),
    [accountProfile, userId],
  )

  useEffect(() => {
    setEditorOpen?.(openId != null)
    return () => setEditorOpen?.(false)
  }, [openId, setEditorOpen])

  const openReport = (report) => {
    setOpenId(report.id)
    setTitle(report.title || '')
    setBody(report.body || '<p></p>')
    setReportDate(String(report.report_date || new Date().toISOString()).slice(0, 10))
    setEditorVersion((value) => value + 1)
  }

  const startReport = () => {
    const today = new Date().toISOString().slice(0, 10)
    setOpenId('new')
    setTitle('')
    setBody('<p></p>')
    setReportDate(today)
    setEditorVersion((value) => value + 1)
  }

  const applyTemplate = async (templateId) => {
    if (!templateId) return
    const template = reportTemplates.find((item) => item.id === templateId)
    if (!template) return
    if (hasMeaningfulEditorContent(body)) {
      const ok = await confirm({
        title: 'Replace report content?',
        message: 'This replaces the current report with the selected template.',
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setBody(template.content || '<p></p>')
    setTitle((current) => current.trim() || template.name)
    setEditorVersion((value) => value + 1)
  }

  const save = async () => {
    try {
      const saved = await saveReport.mutateAsync({
        id: openId === 'new' ? null : openId,
        clientId,
        episodeId: episode.id,
        userId,
        organizationId,
        title,
        body,
        reportDate,
      })
      setOpenId(saved.id)
      setTitle(saved.title || title)
      toast.saved(saved.title ? `Saved ${saved.title}` : 'Report saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save the report')
    }
  }

  const mergeContext = buildMergeContext({
    client,
    profile: clinicianProfile,
    sessionDate: reportDate,
  })

  if (openId) {
    return (
      <DocumentWorkspace
        title={title.trim() || 'Report'}
        clientName={client?.real_name}
        onBack={() => setOpenId(null)}
        actions={(
          <button type="button" className="primary" onClick={save} disabled={saveReport.isPending}>
            {saveReport.isPending ? 'Saving…' : 'Save report'}
          </button>
        )}
        meta={(
          <>
            <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
              <span className="progress-notes-page__meta-label">Title</span>
              <input
                className="progress-notes-page__meta-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="progress-notes-page__meta-field">
              <span className="progress-notes-page__meta-label">Date</span>
              <input
                type="date"
                className="progress-notes-page__meta-input"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </label>
            <label className="progress-notes-page__meta-field progress-notes-page__meta-field--template">
              <span className="progress-notes-page__meta-label">Template</span>
              <select
                className="progress-notes-page__meta-input"
                value=""
                onChange={(event) => applyTemplate(event.target.value)}
              >
                <option value="">Choose a template…</option>
                {reportTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      >
        <RichTextEditor
          key={`${openId}-${editorVersion}`}
          content={body}
          onChange={setBody}
          layout="immersive"
          variant="a4"
          mode="clinical"
          mergeMode="document"
          mergeContext={mergeContext}
          clinicianProfile={clinicianProfile}
        />
      </DocumentWorkspace>
    )
  }

  const rows = reports.map((report) => ({
    id: report.id,
    report,
    filterValues: {
      title: report.title || 'Untitled report',
      date: formatDate(report.report_date),
    },
    sortValues: {
      title: report.title || '',
      date: report.report_date || '',
    },
    cells: {
      title: <span className="record-table__primary">{report.title || 'Untitled report'}</span>,
      date: formatDate(report.report_date),
    },
  }))

  return (
    <CourseAccordion
      title="Reports"
      open={open}
      onToggle={onToggle}
      actions={(
        <button type="button" className="secondary" onClick={startReport}>
          Add
        </button>
      )}
    >
      <RecordTable
        columns={REPORT_COLUMNS}
        rows={rows}
        countNoun="reports"
        defaultSort={{ key: 'date', direction: 'desc' }}
        emptyMessage={isPending ? 'Loading reports…' : 'No reports on this course yet.'}
        onRowClick={(row) => openReport(row.report)}
      />
    </CourseAccordion>
  )
}

function SelectedCourse({ episode, episodes, client, clientId, userId, organizationId }) {
  const [openSection, setOpenSection] = useState('appointments')
  const toggle = (key) => setOpenSection((current) => (current === key ? null : key))

  return (
    <div className="episode-detail">
      <EpisodeAppointments
        episode={episode}
        clientId={clientId}
        episodes={episodes}
        open={openSection === 'appointments'}
        onToggle={() => toggle('appointments')}
      />
      {userId && (
        <EpisodeReports
          episode={episode}
          client={client}
          clientId={clientId}
          userId={userId}
          organizationId={organizationId}
          open={openSection === 'reports'}
          onToggle={() => toggle('reports')}
        />
      )}
      {userId && (
        <EpisodeForms
          episode={episode}
          clientId={clientId}
          userId={userId}
          organizationId={organizationId}
          open={openSection === 'forms'}
          onToggle={() => toggle('forms')}
        />
      )}
      {userId && (
        <EpisodeOutcomes
          episode={episode}
          clientId={clientId}
          userId={userId}
          organizationId={organizationId}
          open={openSection === 'outcomes'}
          onToggle={() => toggle('outcomes')}
        />
      )}
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

  const discharge = async (episode) => {
    if (!episode || !clientId) return
    const ok = await confirm({
      title: `Discharge episode ${episode.episode_number}?`,
      message: 'This closes the course. Appointments stay on it, and a Process Note can still be added from an appointment. You can reopen this course if the client returns.',
      confirmLabel: 'Discharge',
    })
    if (!ok) return
    try {
      const closed = await dischargeEpisode.mutateAsync({ episodeId: episode.id, clientId })
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
        <div className="course-page__episodes">
          <RecordTable
            columns={EPISODE_COLUMNS}
            rows={episodes.map((episode) => {
              const status = STATUS_LABELS[episode.status] || episode.status
              return {
                id: episode.id,
                episode,
                filterValues: {
                  episode: `Episode ${episode.episode_number}`,
                  status,
                  started: formatDate(episode.start_date),
                  ended: formatDate(episode.end_date),
                },
                sortValues: {
                  episode: episode.episode_number,
                  status,
                  started: episode.start_date || '',
                  ended: episode.end_date || '',
                },
                cells: {
                  episode: <span className="record-table__primary">Episode {episode.episode_number}</span>,
                  status: (
                    <span className={`badge ${episode.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
                      {status}
                    </span>
                  ),
                  started: formatDate(episode.start_date),
                  ended: formatDate(episode.end_date),
                  actions: (
                    <div className="course-episode-actions" onClick={(event) => event.stopPropagation()}>
                      {episode.status === 'active' && (
                        <button type="button" className="secondary" onClick={() => discharge(episode)} disabled={episodeBusy}>
                          Discharge
                        </button>
                      )}
                      {episode.status === 'discharged' && (
                        <button type="button" className="secondary" onClick={() => reopen(episode)} disabled={episodeBusy}>
                          Reopen
                        </button>
                      )}
                      <button type="button" className="danger" onClick={() => remove(episode)} disabled={episodeBusy}>
                        Delete
                      </button>
                    </div>
                  ),
                },
              }
            })}
            selectedId={selected?.id}
            countNoun="episodes"
            defaultSort={{ key: 'episode', direction: 'desc' }}
            emptyMessage="No episodes yet."
            onRowClick={(row) => setSelectedId(row.id)}
          />
          {selected && (
            <SelectedCourse
              key={selected.id}
              episode={selected}
              episodes={episodes}
              client={client}
              clientId={clientId}
              userId={userId}
              organizationId={client?.workplace_id || null}
            />
          )}
        </div>
      )}
    </div>
  )
}
