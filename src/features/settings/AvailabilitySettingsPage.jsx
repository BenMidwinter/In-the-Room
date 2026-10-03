import { ProfileAvailabilityBlock } from '../profile/ProfileBlocks'
import { useAppSession } from '../../lib/AppSessionContext'

export default function AvailabilitySettingsPage() {
  const { session, refreshClients } = useAppSession()
  if (!session) return <p className="text-muted">Sign in to edit availability.</p>
  return (
    <div className="role-block-stack">
      <ProfileAvailabilityBlock userId={session.user.id} onSaved={refreshClients} />
    </div>
  )
}
