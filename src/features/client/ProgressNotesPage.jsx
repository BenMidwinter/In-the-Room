import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import {
  WorkspaceLayout,
  StickyContextBar,
} from '../../components/LayoutComponents'
import RichTextEditor from '../../components/RichTextEditor'
import { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import { buildMergeContext } from '../../lib/mergeFields'
import { formatDisplayDate, DEMO_TODAY } from '../../lib/dateArchitecture'
import {
  getAppointment,
  getProfile,
  APPOINTMENT_TYPES,
} from '../../lib/store'
import {
  useClientProgressNotesQuery,
  useProgressNoteQuery,
  useProgressNoteByAppointmentQuery,
  useAvailableProgressNoteTemplatesQuery,
  useAppendProgressNoteAddendumMutation,
  useSaveProgressNoteMutation,
  useSignOffProgressNoteMutation,
} from '../../lib/progressNoteQueries'
import {
  isProgressNoteSignedOff,
  formatLockCountdown,
  formatLockDeadline,
  PROGRESS_NOTE_LOCK_HOURS,
} from '../../lib/progressNoteLifecycle'
import { downloadProgressNotePdf } from '../../lib/clinicalExport'
import { getClinicalExportBranding } from '../../lib/workplaceBranding'
import {
  formatAppointmentDateTime,
  formatAppointmentDate,
  sessionDateFromAppointment,
} from '../../lib/appointmentUtils'
import { useToast, useConfirm } from '../../components/ui'
import ErrorBoundary from '../../components/ErrorBoundary'

function sortNotesLatestFirst(notes) {
  return [...notes].sort((a, b) =>
    String(b.session_date || '').localeCompare(String(a.session_date || '')),
  )
}

function getDefaultPreviewNote(notes, currentNoteId) {
  const sorted = sortNotesLatestFirst(notes)
  if (!sorted.length) return null
  if (!currentNoteId) return sorted[0]
  const others = sorted.filter(n => n.id !== currentNoteId)
  return others[0] || null
}

function getPreviewableNotes(notes, currentNoteId) {
  const sorted = sortNotesLatestFirst(notes)
  if (!currentNoteId) return sorted
  return sorted.filter(n => n.id !== currentNoteId)
}

function PastCaseNotesPanel({
  previewableNotes,
  previewNote,
  previewNoteId,
  previewIndex,
  onSelectNote,
  onCycle,
}) {
  if (!previewableNotes.length) {
    return (
      <div className="progress-notes-page__preview-empty">
        <p className="text-muted text-small">No earlier notes to preview — this may be the first session record.</p>
      </div>
    )
  }

  const author = previewNote ? getProfile(previewNote.author_id) : null

  return (
    <section className="progress-notes-page__preview" aria-label="Past case notes">
      <div className="progress-notes-page__preview-toolbar">
        <div className="progress-notes-page__preview-toolbar-row">
          <span className="text-small text-muted">
            {previewIndex >= 0 ? `${previewIndex + 1} of ${previewableNotes.length}` : '—'}
          </span>
          <div className="progress-notes-page__preview-nav">
            <button
              type="button"
              className="secondary"
              onClick={() => onCycle(-1)}
              disabled={previewableNotes.length < 2}
              aria-label="Newer note"
            >
              ‹
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onCycle(1)}
              disabled={previewableNotes.length < 2}
              aria-label="Older note"
            >
              ›
            </button>
          </div>
        </div>

        <select
          className="paper-input progress-notes-page__preview-select"
          value={previewNoteId || ''}
          onChange={e => onSelectNote(e.target.value)}
          aria-label="Choose note to preview"
        >
          {previewableNotes.map(note => (
            <option key={note.id} value={note.id}>
              {note.title} — {formatDisplayDate(note.session_date)}
            </option>
          ))}
        </select>

        <div className="progress-notes-page__preview-tabs" role="tablist" aria-label="Previous notes by date">
          {previewableNotes.map(note => (
            <button
              key={note.id}
              type="button"
              role="tab"
              aria-selected={previewNoteId === note.id}
              className={`progress-notes-page__preview-tab${previewNoteId === note.id ? ' progress-notes-page__preview-tab--active' : ''}`}
              onClick={() => onSelectNote(note.id)}
              title={note.title}
            >
              {formatDisplayDate(note.session_date)}
            </button>
          ))}
        </div>
      </div>

      {previewNote && (
        <div className="progress-notes-page__preview-body">
          <div className="progress-notes-page__preview-meta">
            <strong>{previewNote.title}</strong>
            <span className="text-small text-muted">
              {formatDisplayDate(previewNote.session_date)}
              {author?.full_name && <> · {author.full_name}</>}
            </span>
          </div>
          <div
            className="progress-notes-page__preview-prose clinical-prose"
            dangerouslySetInnerHTML={{ __html: previewNote.content || '' }}
          />
        </div>
      )}
    </section>
  )
}

export default function ProgressNotesPage() {
  return (
    <ErrorBoundary label="progress-notes">
      <ProgressNotesPageContent />
    </ErrorBoundary>
  )
}

function ProgressNotesPageContent() {
  const [searchParams] = useSearchParams()
  const appointmentParam = searchParams.get('appointment')
  const noteParam = searchParams.get('note')
  const navigate = useNavigate()
  const location = useLocation()
  const { client, session, refreshClients } = useClientSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [title, setTitle] = useState('')
  const [sessionDate, setSessionDate] = useState(DEMO_TODAY)
  const [content, setContent] = useState('<p></p>')
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [noteAppointmentId, setNoteAppointmentId] = useState(appointmentParam || null)
  const [previewNoteId, setPreviewNoteId] = useState(null)
  const [prefillReady, setPrefillReady] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [modalityUsed, setModalityUsed] = useState('')
  const [therapeuticTheme, setTherapeuticTheme] = useState('')
  const [artworkAttachments, setArtworkAttachments] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [addendums, setAddendums] = useState([])
  const [amending, setAmending] = useState(false)
  const [addingAddendum, setAddingAddendum] = useState(false)
  const [addendumBody, setAddendumBody] = useState('<p></p>')
  const [addendumVersion, setAddendumVersion] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [historyWidth, setHistoryWidth] = useState(360)
  const [now, setNow] = useState(() => Date.now())
  const [noteMeta, setNoteMeta] = useState({
    status: 'draft',
    signed_off_at: null,
    lock_until: null,
    is_locked: false,
  })
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const autoSaveKeyRef = useRef('')
  const autoSaveTimerRef = useRef(null)

  const { data: notes = [] } = useClientProgressNotesQuery(client?.id)
  const { data: noteFromUrl, isPending: noteFromUrlPending } = useProgressNoteQuery(noteParam, {
    enabled: Boolean(noteParam && client?.id && !appointmentParam),
  })
  const { data: noteFromAppointment, isPending: noteFromAppointmentPending } = useProgressNoteByAppointmentQuery(appointmentParam, {
    enabled: Boolean(appointmentParam && client?.id),
  })
  const { data: noteTemplates = [] } = useAvailableProgressNoteTemplatesQuery(client?.workplace_id)
  const saveNoteMutation = useSaveProgressNoteMutation()
  const signOffMutation = useSignOffProgressNoteMutation()
  const addendumMutation = useAppendProgressNoteAddendumMutation()
  const saving = saveNoteMutation.isPending || signOffMutation.isPending

  const linkedAppointment = useMemo(() => {
    const appointmentId = appointmentParam || noteAppointmentId
    if (!appointmentId || !client?.id) return null
    const appt = getAppointment(appointmentId)
    if (!appt || appt.client_id !== client.id) return null
    return appt
  }, [appointmentParam, noteAppointmentId, client?.id])

  const applySavedNote = useCallback((saved) => {
    setActiveNoteId(saved.id)
    if (saved.appointment_id) setNoteAppointmentId(saved.appointment_id)
    setNoteMeta({
      status: saved.status || 'draft',
      signed_off_at: saved.signed_off_at || null,
      lock_until: saved.lock_until || null,
      is_locked: Boolean(saved.is_locked),
    })
    setAddendums(saved.addendums || [])
    if (saved.template_id) setTemplateId(saved.template_id)
  }, [])

  const buildNotePayload = useCallback(() => ({
    id: activeNoteId || undefined,
    client_id: client.id,
    appointment_id: linkedAppointment?.id ?? null,
    title: title.trim() || `Session note — ${sessionDate}`,
    content,
    session_date: sessionDate,
    modality_used: modalityUsed || null,
    therapeutic_theme: therapeuticTheme.trim(),
    artwork_attachments: artworkAttachments,
    template_id: templateId || null,
  }), [
    activeNoteId,
    client.id,
    linkedAppointment?.id,
    title,
    content,
    sessionDate,
    modalityUsed,
    therapeuticTheme,
    artworkAttachments,
    templateId,
  ])

  const noteSignedOff = isProgressNoteSignedOff(noteMeta)
  const noteLocked = Boolean(
    noteSignedOff
    && noteMeta.lock_until
    && now >= new Date(noteMeta.lock_until).getTime(),
  )
  const editorEditable = !noteSignedOff || (amending && !noteLocked)
  const countdownLabel = noteSignedOff && !noteLocked
    ? formatLockCountdown(noteMeta.lock_until, now)
    : null
  const lockDeadlineLabel = formatLockDeadline(noteMeta.lock_until)

  const isStandalone = !linkedAppointment
  const filingError = !linkedAppointment
    ? 'A Process Note is saved against an appointment.'
    : !linkedAppointment.episode_id
      ? 'Add this appointment to an episode before saving the Process Note.'
      : ''
  const clinicianProfile = session?.user?.id ? getProfile(session.user.id) : null

  const syncAutoSaveBaseline = useCallback((payload) => {
    autoSaveKeyRef.current = JSON.stringify(payload)
  }, [])

  useEffect(() => {
    if (!noteSignedOff || !noteMeta.lock_until || noteLocked) return undefined
    const remaining = new Date(noteMeta.lock_until).getTime() - Date.now()
    const lockTimer = window.setTimeout(() => setNow(Date.now()), Math.max(0, remaining))
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(lockTimer)
      window.clearInterval(tick)
    }
  }, [noteSignedOff, noteMeta.lock_until, noteLocked])

  useEffect(() => {
    if (noteLocked) setAmending(false)
  }, [noteLocked])

  useEffect(() => {
    if (noteParam && client?.id && !appointmentParam) {
      if (noteFromUrlPending) return
      const existing = noteFromUrl
      if (existing && existing.client_id === client.id) {
        setTitle(existing.title)
        setContent(existing.content)
        setSessionDate(existing.session_date)
        setModalityUsed(existing.modality_used || '')
        setTherapeuticTheme(existing.therapeutic_theme || '')
        setArtworkAttachments(existing.artwork_attachments || [])
        setTemplateId(existing.template_id || '')
        setAddendums(existing.addendums || [])
        setAmending(false)
        setAddingAddendum(false)
        setActiveNoteId(existing.id)
        setNoteAppointmentId(existing.appointment_id || null)
        applySavedNote(existing)
        syncAutoSaveBaseline({
          id: existing.id,
          client_id: client.id,
          appointment_id: existing.appointment_id,
          title: existing.title,
          content: existing.content,
          session_date: existing.session_date,
          modality_used: existing.modality_used || null,
          therapeutic_theme: existing.therapeutic_theme || '',
          artwork_attachments: existing.artwork_attachments || [],
          template_id: existing.template_id || null,
        })
        setPrefillReady(true)
        return
      }
    }

    if (!appointmentParam || !client?.id) {
      if (!noteParam) {
        setTitle('')
        setContent('<p></p>')
        setSessionDate(DEMO_TODAY)
        setModalityUsed('')
        setTherapeuticTheme('')
        setArtworkAttachments([])
        setTemplateId('')
        setAddendums([])
        setAmending(false)
        setAddingAddendum(false)
        setActiveNoteId(null)
        setNoteAppointmentId(null)
        setNoteMeta({ status: 'draft', signed_off_at: null, lock_until: null, is_locked: false })
        autoSaveKeyRef.current = ''
      }
      setPrefillReady(true)
      return
    }

    const appt = linkedAppointment
    if (!appt) {
      setPrefillReady(true)
      return
    }

    if (noteFromAppointmentPending) return

    const existing = noteFromAppointment
    if (existing) {
      setTitle(existing.title)
      setContent(existing.content)
      setSessionDate(existing.session_date)
      setModalityUsed(existing.modality_used || '')
      setTherapeuticTheme(existing.therapeutic_theme || '')
      setArtworkAttachments(existing.artwork_attachments || [])
      setTemplateId(existing.template_id || '')
      setAddendums(existing.addendums || [])
      setAmending(false)
      setAddingAddendum(false)
      setActiveNoteId(existing.id)
      setNoteAppointmentId(existing.appointment_id || appt.id)
      applySavedNote(existing)
      syncAutoSaveBaseline({
        id: existing.id,
        client_id: client.id,
        appointment_id: existing.appointment_id || appt.id,
        title: existing.title,
        content: existing.content,
        session_date: existing.session_date,
        modality_used: existing.modality_used || null,
        therapeutic_theme: existing.therapeutic_theme || '',
        artwork_attachments: existing.artwork_attachments || [],
        template_id: existing.template_id || null,
      })
      setPrefillReady(true)
      return
    }

    const typeLabel = APPOINTMENT_TYPES[appt.appointment_type] || 'Session'
    setTitle(`${typeLabel} — ${formatAppointmentDate(appt.scheduled_at)}`)
    setSessionDate(sessionDateFromAppointment(appt.scheduled_at))
    setContent('<p></p>')
    setModalityUsed('')
    setTherapeuticTheme('')
    setArtworkAttachments([])
    setTemplateId('')
    setAddendums([])
    setAmending(false)
    setAddingAddendum(false)
    setActiveNoteId(null)
    setNoteAppointmentId(appt.id)
    setNoteMeta({ status: 'draft', signed_off_at: null, lock_until: null, is_locked: false })
    autoSaveKeyRef.current = ''
    setPrefillReady(true)
  }, [
    appointmentParam,
    noteParam,
    client?.id,
    linkedAppointment,
    noteFromUrl,
    noteFromUrlPending,
    noteFromAppointment,
    noteFromAppointmentPending,
    applySavedNote,
    syncAutoSaveBaseline,
  ])

  const noteHeading = activeNoteId
    ? (isStandalone ? 'Process Note' : 'Session note')
    : (isStandalone ? 'New Process Note' : 'New session note')

  const previewableNotes = useMemo(
    () => getPreviewableNotes(notes, activeNoteId),
    [notes, activeNoteId],
  )

  useEffect(() => {
    const defaultPreview = getDefaultPreviewNote(notes, activeNoteId)
    setPreviewNoteId(defaultPreview?.id ?? null)
  }, [notes, activeNoteId])

  const previewNote = previewNoteId
    ? notes.find(n => n.id === previewNoteId) ?? null
    : null

  const previewIndex = previewNote
    ? previewableNotes.findIndex(n => n.id === previewNote.id)
    : -1

  const cyclePreview = (direction) => {
    if (!previewableNotes.length) return
    const nextIndex = previewIndex === -1
      ? (direction > 0 ? 0 : previewableNotes.length - 1)
      : (previewIndex + direction + previewableNotes.length) % previewableNotes.length
    setPreviewNoteId(previewableNotes[nextIndex].id)
  }

  const mergeContext = useMemo(
    () => buildMergeContext({
      client,
      appointment: linkedAppointment,
      profile: clinicianProfile,
      sessionDate,
    }),
    [client, linkedAppointment, clinicianProfile, sessionDate],
  )

  const applyNoteTemplate = async (nextId) => {
    if (!editorEditable) return
    if (!nextId) {
      setTemplateId('')
      return
    }
    const template = noteTemplates.find((item) => item.id === nextId)
    if (!template) return
    if (template.id === templateId) return
    if (hasMeaningfulEditorContent(content)) {
      const ok = await confirm({
        title: 'Replace note content?',
        message: 'This replaces the current note content with the selected template.',
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setTemplateId(template.id)
    setContent(template.content || '<p></p>')
    setEditorVersion((value) => value + 1)
  }

  const goBack = () => {
    if (location.key !== 'default') {
      navigate(-1)
      return
    }
    navigate(`/clients/${client.id}/notes-history`)
  }

  const startHistoryResize = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = historyWidth
    const move = (moveEvent) => {
      const next = Math.min(720, Math.max(220, startWidth - (moveEvent.clientX - startX)))
      setHistoryWidth(next)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const persistNote = useCallback(({
    onSuccess,
    silent = false,
    redirectAfterSave = false,
  } = {}) => {
    if (!session?.user?.id) {
      if (!silent) toast.error('Session unavailable — please refresh the page.')
      return
    }
    if (noteLocked || (noteSignedOff && !amending)) {
      if (!silent) toast.error(noteLocked ? 'This note is locked and cannot be edited.' : 'Choose Edit to amend this note.')
      return
    }
    const payload = buildNotePayload()
    saveNoteMutation.mutate(
      { payload, userId: session.user.id },
      {
        onSuccess: (saved) => {
          applySavedNote(saved)
          syncAutoSaveBaseline(payload)
          setLastSavedAt(Date.now())
          setAutoSaveStatus('saved')
          refreshClients?.()
          if (redirectAfterSave) {
            navigate(`/clients/${client.id}/notes-history`)
          } else if (isStandalone && !noteParam && saved.id) {
            navigate(`/clients/${client.id}/progress-notes?appointment=${saved.appointment_id || linkedAppointment?.id || ''}`, { replace: true })
          }
          onSuccess?.(saved)
        },
        onError: (err) => {
          setAutoSaveStatus('error')
          if (!silent) toast.error(err?.message || 'Could not save this note.')
        },
      },
    )
  }, [
    session?.user?.id,
    noteLocked,
    noteSignedOff,
    amending,
    buildNotePayload,
    saveNoteMutation,
    applySavedNote,
    syncAutoSaveBaseline,
    refreshClients,
    isStandalone,
    noteParam,
    linkedAppointment,
    client.id,
    navigate,
    toast,
  ])

  useEffect(() => {
    if (!prefillReady || !client?.id || !session?.user?.id || !editorEditable || filingError) return

    const payload = buildNotePayload()
    const key = JSON.stringify(payload)
    if (key === autoSaveKeyRef.current) return

    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveStatus('saving')
      persistNote({ silent: true })
    }, 2500)

    return () => clearTimeout(autoSaveTimerRef.current)
  }, [prefillReady, client?.id, session?.user?.id, editorEditable, filingError, buildNotePayload, persistNote])

  const handleSaveDraft = () => {
    if (filingError) {
      toast.error(filingError)
      return
    }
    if (!title.trim()) {
      toast.error('Please add a title for this note.')
      return
    }
    persistNote({
      redirectAfterSave: true,
      onSuccess: () => toast.success('Draft saved'),
    })
  }

  const handleSignOff = async () => {
    if (filingError) {
      toast.error(filingError)
      return
    }
    if (!title.trim()) {
      toast.error('Please add a title before sign-off.')
      return
    }
    if (noteSignedOff) {
      toast.info(noteMeta.is_locked
        ? 'This note is locked.'
        : `Already signed off — amendments allowed until ${lockDeadlineLabel}.`)
      return
    }
    const ok = await confirm({
      title: 'Save and sign off?',
      message: `The note will be signed off. It opens read-only, and Edit stays available for ${PROGRESS_NOTE_LOCK_HOURS} hours. After that the note locks and you can add an addendum below it.`,
      confirmLabel: 'Save & sign-off',
    })
    if (!ok) return

    const payload = buildNotePayload()
    signOffMutation.mutate(
      { payload, userId: session.user.id },
      {
        onSuccess: (saved) => {
          applySavedNote(saved)
          syncAutoSaveBaseline(payload)
          setLastSavedAt(Date.now())
          setAutoSaveStatus('saved')
          refreshClients?.()
          toast.success(`Signed off — Edit is available for ${PROGRESS_NOTE_LOCK_HOURS} hours`)
          navigate(`/clients/${client.id}/notes-history`)
        },
        onError: (err) => {
          toast.error(err?.message || 'Could not sign off this note.')
        },
      },
    )
  }

  const handleSaveAddendum = () => {
    if (!activeNoteId) return
    addendumMutation.mutate(
      { noteId: activeNoteId, body: addendumBody },
      {
        onSuccess: (saved) => {
          setAddendums(saved.addendums || [])
          setAddendumBody('<p></p>')
          setAddendumVersion((value) => value + 1)
          setAddingAddendum(false)
          toast.saved('Addendum saved')
        },
        onError: (err) => toast.error(err?.message || 'Could not save the addendum'),
      },
    )
  }

  const handleDownload = () => {
    const note = {
      ...buildNotePayload(),
      status: noteMeta.status,
      signed_off_at: noteMeta.signed_off_at,
    }
    const branding = getClinicalExportBranding(client.workplace_id, session?.user?.id)
    const opened = downloadProgressNotePdf(note, {
      clientName: client.real_name,
      authorName: clinicianProfile?.full_name,
      branding,
    })
    if (!opened) {
      toast.error('Could not open the print dialog. Please try again.')
      return
    }
    toast.info('Choose “Save as PDF” in the print dialog.')
  }

  const autoSaveLabel = autoSaveStatus === 'saving'
    ? 'Saving…'
    : autoSaveStatus === 'error'
      ? 'Auto-save failed'
      : lastSavedAt
        ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Auto-save on'

  if (!prefillReady) return null

  return (
    <WorkspaceLayout className="progress-notes-page">
      <StickyContextBar
        className="progress-notes-page__header"
        leading={(
          <>
            <button type="button" className="secondary" onClick={goBack}>
              Back
            </button>
            <h1>{noteHeading}</h1>
            <span className="text-small text-muted">{client.real_name}</span>
          </>
        )}
        trailing={(
          <div className="progress-notes-page__header-actions">
            <span className="progress-notes-page__save-status text-small text-muted" aria-live="polite">
              {noteLocked ? 'Locked' : editorEditable ? autoSaveLabel : 'Signed off'}
            </span>
            <button type="button" className="secondary" onClick={handleDownload}>
              Download
            </button>
            {!historyOpen && (
              <button type="button" className="secondary" onClick={() => setHistoryOpen(true)}>
                Previous notes
              </button>
            )}
            {noteLocked ? (
              <button
                type="button"
                className="primary"
                onClick={() => setAddingAddendum(true)}
                disabled={addingAddendum}
              >
                Add addendum
              </button>
            ) : noteSignedOff && !amending ? (
              <button type="button" className="primary" onClick={() => setAmending(true)}>
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleSaveDraft}
                  disabled={saving || !editorEditable || Boolean(filingError)}
                >
                  {saving ? 'Saving…' : noteSignedOff ? 'Save' : 'Save draft'}
                </button>
                {!noteSignedOff && (
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSignOff}
                    disabled={saving || !editorEditable || Boolean(filingError)}
                  >
                    Save & sign-off
                  </button>
                )}
              </>
            )}
          </div>
        )}
      />

      {linkedAppointment ? (
        <div className="progress-notes-page__banner linked-record-banner">
          <span className="text-small">
            {formatAppointmentDateTime(linkedAppointment.scheduled_at)}
            {' · '}{APPOINTMENT_TYPES[linkedAppointment.appointment_type]}
            {linkedAppointment.location && ` · ${linkedAppointment.location}`}
            {filingError ? ` · ${filingError}` : ''}
          </span>
        </div>
      ) : (
        <div className="progress-notes-page__banner progress-notes-page__banner--standalone">
          <span className="text-small text-muted">
            A Process Note is saved against an appointment. Open the appointment and use Add Process Note.
          </span>
        </div>
      )}

      {countdownLabel ? (
        <div className="progress-notes-page__banner progress-notes-page__banner--signed-off" role="status">
          <span className="text-small">Locks in {countdownLabel}</span>
        </div>
      ) : null}

      <div className="progress-notes-page__meta-bar" role="group" aria-label="Note metadata">
        <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
          <span className="progress-notes-page__meta-label">Title</span>
          <input
            className="progress-notes-page__meta-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Session note title"
            disabled={!editorEditable}
          />
        </label>

        <label className="progress-notes-page__meta-field">
          <span className="progress-notes-page__meta-label">Session date</span>
          <input
            type="date"
            className="progress-notes-page__meta-input"
            value={sessionDate}
            onChange={e => setSessionDate(e.target.value)}
            disabled={!editorEditable}
          />
        </label>

        <label className="progress-notes-page__meta-field progress-notes-page__meta-field--template">
          <span className="progress-notes-page__meta-label">Template</span>
          <select
            className="progress-notes-page__meta-input"
            value={templateId}
            onChange={(event) => applyNoteTemplate(event.target.value)}
            disabled={!editorEditable}
          >
            <option value="">No template</option>
            {noteTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={`note-split${historyOpen ? ' note-split--open' : ''}`}>
        <main className="note-split__editor progress-notes-page__editor">
          <div className="progress-notes-page__canvas-zone">
            <RichTextEditor
              key={`${activeNoteId || 'new'}-${linkedAppointment?.id || 'standalone'}-${editorVersion}`}
              content={content}
              onChange={setContent}
              layout="immersive"
              variant="a4"
              mode="clinical"
              editable={editorEditable}
              mergeContext={mergeContext}
              clinicianProfile={clinicianProfile}
            />
          </div>
          {addendums.length > 0 && (
            <div className="progress-note-addenda">
              {addendums.map((item) => (
                <article key={item.id} className="progress-note-addendum">
                  <p className="text-small text-muted">
                    Addendum · {item.created_at ? new Date(item.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  </p>
                  <div
                    className="progress-note-addendum__body clinical-prose"
                    dangerouslySetInnerHTML={{ __html: item.body }}
                  />
                </article>
              ))}
            </div>
          )}
          {addingAddendum && (
            <div className="progress-note-addendum progress-note-addendum--draft">
              <p className="text-small text-muted">Addendum</p>
              <RichTextEditor
                key={`addendum-${addendumVersion}`}
                content={addendumBody}
                onChange={setAddendumBody}
                layout="immersive"
                variant="a4"
                mode="clinical"
              />
              <div className="progress-note-addendum__actions">
                <button type="button" className="secondary" onClick={() => setAddingAddendum(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={handleSaveAddendum}
                  disabled={addendumMutation.isPending}
                >
                  {addendumMutation.isPending ? 'Saving…' : 'Save addendum'}
                </button>
              </div>
            </div>
          )}
        </main>
        {historyOpen && (
          <>
            <div
              className="note-split__handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize previous notes"
              onPointerDown={startHistoryResize}
            />
            <aside
              className="note-split__history progress-notes-page__rail"
              style={{ width: historyWidth }}
              aria-label="Previous notes"
            >
              <div className="note-split__history-bar">
                <h2>Previous notes</h2>
                <button type="button" className="secondary" onClick={() => setHistoryOpen(false)}>
                  Hide
                </button>
              </div>
              <PastCaseNotesPanel
                previewableNotes={previewableNotes}
                previewNote={previewNote}
                previewNoteId={previewNoteId}
                previewIndex={previewIndex}
                onSelectNote={setPreviewNoteId}
                onCycle={cyclePreview}
              />
            </aside>
          </>
        )}
      </div>
    </WorkspaceLayout>
  )
}
