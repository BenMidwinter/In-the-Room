import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { getProgressNote } from '../../lib/store'

/** Legacy paths → appointment-scoped note URL. */
export default function ProgressNotesRedirect() {
  const { clientId, noteId } = useParams()
  const [searchParams] = useSearchParams()
  const appointment = searchParams.get('appointment')

  if (appointment) {
    return <Navigate to={`/clients/${clientId}/progress-notes?appointment=${appointment}`} replace />
  }

  if (noteId && noteId !== 'new') {
    const note = getProgressNote(noteId)
    if (note?.appointment_id) {
      return <Navigate to={`/clients/${clientId}/progress-notes?appointment=${note.appointment_id}`} replace />
    }
    if (note) {
      return <Navigate to={`/clients/${clientId}/progress-notes?note=${noteId}`} replace />
    }
  }

  return <Navigate to={`/clients/${clientId}/progress-notes`} replace />
}
