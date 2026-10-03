import { useAppSession } from '../../lib/AppSessionContext'
import {
  ProfileIdentityBlock,
  ProfileAvailabilityBlock,
  ProfileLetterheadBlock,
} from './ProfileBlocks'

export default function ProfileDetails() {
  const { session, refreshClients } = useAppSession()

  if (!session) {
    return <p className="text-muted">Profile session unavailable. Return to Home and try again.</p>
  }

  return (
    <div className="role-block-stack profile-hub">
      <ProfileIdentityBlock session={session} onSaved={refreshClients} />
      <ProfileAvailabilityBlock userId={session.user.id} onSaved={refreshClients} />
      <ProfileLetterheadBlock userId={session.user.id} />
    </div>
  )
}
