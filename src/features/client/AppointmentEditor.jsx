import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppointmentOverlay } from '../appointments/AppointmentOverlay'
import { todayYmd } from '../../lib/dateArchitecture'

/**
 * Deep links into a client appointment open the shared card (or the create
 * form for /new) and return to the list, so the editor is never the landing view.
 */
export default function AppointmentEditor() {
  const { id: clientId, appointmentId } = useParams()
  const navigate = useNavigate()
  const overlay = useAppointmentOverlay()
  const opened = useRef(false)
  const isNew = !appointmentId || appointmentId === 'new'

  useEffect(() => {
    if (opened.current || !clientId) return
    opened.current = true
    if (isNew) {
      overlay.openCreate({
        clientId,
        lockedClient: true,
        sessionDate: todayYmd(),
        startTime: '09:00',
        manual: true,
      })
    } else {
      overlay.openView(appointmentId)
    }
    navigate(`/clients/${clientId}/appointments`, { replace: true })
  }, [appointmentId, clientId, isNew, navigate, overlay])

  return null
}
