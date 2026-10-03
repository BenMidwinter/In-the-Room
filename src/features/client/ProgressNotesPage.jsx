import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import {
  WorkspaceLayout,
  StickyContextBar,
  SplitWorkspace,
} from '../../components/LayoutComponents'
import RichTextEditor from '../../components/RichTextEditor'
import TemplatePicker, { hasMeaningfulEditorContent } from '../../components/TemplatePicker'
import ClinicalInsightsSidebar from './ClinicalInsightsSidebar'
import ArtworkAttachmentZone from './ArtworkAttachmentZone'
import { usePermissions } from '../../lib/usePermissions'
import { buildMergeContext } from '../../lib/mergeFields'
import { MODALITY_OPTIONS } from '../../lib/intakeForm'
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
  useSaveProgressNoteMutation,
  useSignOffProgressNoteMutation,
} from '../../lib/progressNoteQueries'
import {
  isProgressNoteEditable,
  isProgressNoteSignedOff,
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

const RAIL_TABS = {
  INSIGHTS: 'insights',
  HISTORY: 'history',
}

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
  const { client, session, refreshClients } = useClientSession()
  const perms = usePermissions(client)
  const toast = useToast()
  const confirm = useConfirm()

  const [title, setTitle] = useState('')
  const [sessionDate, setSessionDate] = useState(DEMO_TODAY)
  const [content, setContent] = useState('<p></p>')
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [previewNoteId, setPreviewNoteId] = useState(null)
  const [prefillReady, setPrefillReady] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [modalityUsed, setModalityUsed] = useState('')
  const [therapeuticTheme, setTherapeuticTheme] = useState('')
  const [artworkAttachments, setArtworkAttachments] = useState([])
  const [noteEditor, setNoteEditor] = useState(null)
  const [railTab, setRailTab] = useState(RAIL_TABS.INSIGHTS)
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
  const saving = saveNoteMutation.isPending || signOffMutation.isPending

  const linkedAppointment = useMemo(() => {
    if (!appointmentParam || !client?.id) return null
    const appt = getAppointment(appointmentParam)
    if (!appt || appt.client_id !== client.id) return null
    return appt
  }, [appointmentParam, client?.id])

  const applySavedNote = useCallback((saved) => {
    setActiveNoteId(saved.id)
    setNoteMeta({
      status: saved.status || 'draft',
      signed_off_at: saved.signed_off_at || null,
      lock_until: saved.lock_until || null,
      is_locked: Boolean(saved.is_locked),
    })
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
  ])

  const noteEditable = isProgressNoteEditable(noteMeta)
  const noteSignedOff = isProgressNoteSignedOff(noteMeta)
  const lockDeadlineLabel = formatLockDeadline(noteMeta.lock_until)

  const isStandalone = !linkedAppointment
  const clinicianProfile = session?.user?.id ? getProfile(session.user.id) : null

  const syncAutoSaveBaseline = useCallback((payload) => {
    autoSaveKeyRef.current = JSON.stringify(payload)
  }, [])

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
        setActiveNoteId(existing.id)
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
        setActiveNoteId(null)
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
      setActiveNoteId(existing.id)
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
    setActiveNoteId(null)
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
    ? (isStandalone ? 'Progress note' : 'Session note')
    : (isStandalone ? 'New progress note' : 'New session note')

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

  const applyNoteTemplate = async (template) => {
    if (hasMeaningfulEditorContent(content)) {
      const ok = await confirm({
        title: 'Replace note content?',
        message: 'This replaces the current note content with the selected template.',
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setContent(template.content)
    setEditorVersion(v => v + 1)
  }

  const insertIntoNote = useCallback((text) => {
    if (!noteEditor || noteEditor.isDestroyed) return
    noteEditor.chain().focus().insertContent(`${text} `).run()
  }, [noteEditor])

  const persistNote = useCallback(({
    onSuccess,
    silent = false,
    redirectAfterSave = false,
  } = {}) => {
    if (!session?.user?.id) {
      if (!silent) toast.error('Session unavailable — please refresh the page.')
      return
    }
    if (noteMeta.is_locked) {
      if (!silent) toast.error('This note is locked and cannot be edited.')
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
            navigate(`/clients/${client.id}/progress-notes?note=${saved.id}`, { replace: true })
          }
          onSuccess?.(saved)
        },
        onError: () => {
          setAutoSaveStatus('error')
          if (!silent) toast.error('Could not save this note.')
        },
      },
    )
  }, [
    session?.user?.id,
    noteMeta.is_locked,
    buildNotePayload,
    saveNoteMutation,
    applySavedNote,
    syncAutoSaveBaseline,
    refreshClients,
    isStandalone,
    noteParam,
    client.id,
    navigate,
    toast,
  ])

  useEffect(() => {
    if (!prefillReady || !client?.id || !session?.user?.id || noteMeta.is_locked) return

    const payload = buildNotePayload()
    const key = JSON.stringify(payload)
    if (key === autoSaveKeyRef.current) return

    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveStatus('saving')
      persistNote({ silent: true })
    }, 2500)

    return () => clearTimeout(autoSaveTimerRef.current)
  }, [prefillReady, client?.id, session?.user?.id, noteMeta.is_locked, buildNotePayload, persistNote])

  const handleSaveDraft = () => {
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
      message: `The note will be signed off and remain editable for ${PROGRESS_NOTE_LOCK_HOURS} hours. After that it locks permanently.`,
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
          toast.success(`Signed off — amendments allowed until ${formatLockDeadline(saved.lock_until)}`)
          navigate(`/clients/${client.id}/notes-history`)
        },
        onError: (err) => {
          toast.error(err?.message || 'Could not sign off this note.')
        },
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

  if (!perms.canWriteProgressNotes) {
    return (
      <div className="progress-notes-page">
        <header className="progress-notes-page__header">
          <div className="progress-notes-page__header-main">
            <button type="button" className="secondary" onClick={() => navigate(`/clients/${client?.id}`)}>
              ← Back to client
            </button>
            <h1>Progress notes</h1>
          </div>
        </header>
        <div className="progress-notes-page__body progress-notes-page__body--centered">
          <div className="permission-notice">
            <p><strong>{perms.roleLabel}s cannot write progress notes.</strong></p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <WorkspaceLayout className="progress-notes-page">
      <StickyContextBar
        className="progress-notes-page__header"
        leading={(
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(
                isStandalone
                  ? `/clients/${client.id}/notes-history`
                  : `/clients/${client.id}/appointments/${linkedAppointment.id}`,
              )}
            >
              {isStandalone ? '← Notes history' : '← Appointment'}
            </button>
            <h1>{noteHeading}</h1>
            <span className="text-small text-muted">{client.real_name}</span>
          </>
        )}
        trailing={(
          <div className="progress-notes-page__header-actions">
            <span className="progress-notes-page__save-status text-small text-muted" aria-live="polite">
              {noteMeta.is_locked ? 'Locked' : autoSaveLabel}
            </span>
            <button type="button" className="secondary" onClick={handleDownload}>
              Download
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleSaveDraft}
              disabled={saving || !noteEditable}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleSignOff}
              disabled={saving || !noteEditable || noteSignedOff}
            >
              {noteSignedOff && !noteMeta.is_locked ? 'Signed off' : 'Save & sign-off'}
            </button>
          </div>
        )}
      />

      {linkedAppointment ? (
        <div className="progress-notes-page__banner linked-record-banner">
          <span className="text-small">
            {formatAppointmentDateTime(linkedAppointment.scheduled_at)}
            {' · '}{APPOINTMENT_TYPES[linkedAppointment.appointment_type]}
            {linkedAppointment.location && ` · ${linkedAppointment.location}`}
          </span>
          <Link to={`/clients/${client.id}/appointments/${linkedAppointment.id}`} className="text-small">
            View appointment
          </Link>
        </div>
      ) : (
        <div className="progress-notes-page__banner progress-notes-page__banner--standalone">
          <span className="text-small text-muted">
            Standalone progress note — not linked to an appointment.
          </span>
        </div>
      )}

      {noteMeta.is_locked ? (
        <div className="progress-notes-page__banner progress-notes-page__banner--locked" role="status">
          <span className="text-small">
            <strong>Locked.</strong> This note was signed off and the {PROGRESS_NOTE_LOCK_HOURS}-hour amendment window has ended.
          </span>
        </div>
      ) : noteSignedOff && lockDeadlineLabel ? (
        <div className="progress-notes-page__banner progress-notes-page__banner--signed-off" role="status">
          <span className="text-small">
            <strong>Signed off.</strong> Amendments allowed until {lockDeadlineLabel}, then this note locks permanently.
          </span>
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
            disabled={!noteEditable}
          />
        </label>

        <label className="progress-notes-page__meta-field">
          <span className="progress-notes-page__meta-label">Session date</span>
          <input
            type="date"
            className="progress-notes-page__meta-input"
            value={sessionDate}
            onChange={e => setSessionDate(e.target.value)}
            disabled={!noteEditable}
          />
        </label>

        <label className="progress-notes-page__meta-field">
          <span className="progress-notes-page__meta-label">Modality</span>
          <select className="progress-notes-page__meta-input" value={modalityUsed} onChange={e => setModalityUsed(e.target.value)} disabled={!noteEditable}>
            <option value="">Select…</option>
            {MODALITY_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>

        <label className="progress-notes-page__meta-field progress-notes-page__meta-field--theme">
          <span className="progress-notes-page__meta-label">Theme</span>
          <input
            className="progress-notes-page__meta-input"
            value={therapeuticTheme}
            onChange={e => setTherapeuticTheme(e.target.value)}
            placeholder="e.g. Bridge / transition"
            disabled={!noteEditable}
          />
        </label>

        <div className="progress-notes-page__meta-field progress-notes-page__meta-field--template">
          <TemplatePicker
            templates={noteTemplates}
            onApply={applyNoteTemplate}
            label="Template"
            emptyLabel="Choose template…"
          />
        </div>
      </div>

      <SplitWorkspace
        paneOpen
        className="progress-notes-page__workspace split-layout split-layout--note ck-split ck-split--pane-open"
        main={(
          <main className="split-layout__main progress-notes-page__editor">
            <div className="progress-notes-page__artwork-strip">
              <ArtworkAttachmentZone
                attachments={artworkAttachments}
                onChange={setArtworkAttachments}
                disabled={!noteEditable}
              />
            </div>
            <div className="progress-notes-page__canvas-zone">
              <RichTextEditor
                key={`${activeNoteId || 'new'}-${linkedAppointment?.id || 'standalone'}-${editorVersion}`}
                content={content}
                onChange={setContent}
                layout="immersive"
                variant="a4"
                mode="clinical"
                editable={noteEditable}
                mergeContext={mergeContext}
                clinicianProfile={clinicianProfile}
                onEditorReady={setNoteEditor}
              />
            </div>
          </main>
        )}
        accessory={(
          <aside className="split-layout__side progress-notes-page__rail" aria-label="Note context">
          <div className="progress-notes-page__rail-tabs" role="tablist" aria-label="Sidebar views">
            <button
              type="button"
              role="tab"
              aria-selected={railTab === RAIL_TABS.INSIGHTS}
              className={`progress-notes-page__rail-tab${railTab === RAIL_TABS.INSIGHTS ? ' progress-notes-page__rail-tab--active' : ''}`}
              onClick={() => setRailTab(RAIL_TABS.INSIGHTS)}
            >
              Current profile & intake
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={railTab === RAIL_TABS.HISTORY}
              className={`progress-notes-page__rail-tab${railTab === RAIL_TABS.HISTORY ? ' progress-notes-page__rail-tab--active' : ''}`}
              onClick={() => setRailTab(RAIL_TABS.HISTORY)}
            >
              Past Case Notes
            </button>
          </div>

          <div className="progress-notes-page__rail-panel">
            {railTab === RAIL_TABS.INSIGHTS ? (
              <ClinicalInsightsSidebar
                clientId={client.id}
                client={client}
                onInsert={insertIntoNote}
                embedded
              />
            ) : (
              <PastCaseNotesPanel
                previewableNotes={previewableNotes}
                previewNote={previewNote}
                previewNoteId={previewNoteId}
                previewIndex={previewIndex}
                onSelectNote={setPreviewNoteId}
                onCycle={cyclePreview}
              />
            )}
          </div>
        </aside>
        )}
      />
    </WorkspaceLayout>
  )
}
