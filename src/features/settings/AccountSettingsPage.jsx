import {
  ProfileIdentityBlock,
  ProfileLetterheadBlock,
} from '../profile/ProfileBlocks'
import { useAppSession } from '../../lib/AppSessionContext'

export default function AccountSettingsPage() {
  const { session, refreshClients } = useAppSession()

  if (!session) {
    return <p className="text-muted">Sign in to edit account settings.</p>
  }

  return (
    <div className="role-block-stack">
      <ProfileIdentityBlock session={session} onSaved={refreshClients} />
      <ProfileLetterheadBlock />
    </div>
  )
}
