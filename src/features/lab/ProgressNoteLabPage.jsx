import { useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import RichTextEditor from '../../components/RichTextEditor'
import { MODALITY_OPTIONS } from '../../lib/intakeForm'
import { useAppSession } from '../../lib/AppSessionContext'
import { getProfile } from '../../lib/store'
import { buildMergeContext } from '../../lib/mergeFields'

/**
 * Temporary sandbox for the progress-note editor — no client record required.
 * Remove or gate this route before production launch.
 */
export default function ProgressNoteLabPage() {
  const { session } = useAppSession()
  const [title, setTitle] = useState('Sandbox Process Note')
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [modalityUsed, setModalityUsed] = useState('music_therapy')
  const [content, setContent] = useState('<p></p>')

  const clinicianProfile = useMemo(
    () => (session?.user?.id ? getProfile(session.user.id) : null),
    [session?.user?.id],
  )

  const mergeContext = useMemo(
    () => buildMergeContext({
      client: { real_name: 'Sandbox Client', dob: '2012-01-01' },
      appointment: { appointment_type: 'one_to_one', location: 'Private practice' },
      profile: clinicianProfile,
      sessionDate,
    }),
    [clinicianProfile, sessionDate],
  )

  return (
    <div className="page page--progress-note-lab">
      <PageHeader
        title="Process Note lab"
        subtitle="Temporary editor sandbox — no client record. Safe to experiment with layout and typography."
      />

      <div className="progress-notes-page__meta-bar" role="group" aria-label="Note metadata">
        <label className="progress-notes-page__meta-field progress-notes-page__meta-field--title">
          <span className="progress-notes-page__meta-label">Title</span>
          <input
            className="progress-notes-page__meta-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Session note title"
          />
        </label>

        <label className="progress-notes-page__meta-field">
          <span className="progress-notes-page__meta-label">Session date</span>
          <input
            type="date"
            className="progress-notes-page__meta-input"
            value={sessionDate}
            onChange={e => setSessionDate(e.target.value)}
          />
        </label>

        <label className="progress-notes-page__meta-field">
          <span className="progress-notes-page__meta-label">Modality</span>
          <select
            className="progress-notes-page__meta-input"
            value={modalityUsed}
            onChange={e => setModalityUsed(e.target.value)}
          >
            <option value="">Select…</option>
            {MODALITY_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="progress-note-lab__canvas">
        <RichTextEditor
          content={content}
          onChange={setContent}
          layout="immersive"
          variant="a4"
          mode="clinical"
          editable
          mergeContext={mergeContext}
          clinicianProfile={clinicianProfile}
        />
      </div>
    </div>
  )
}
