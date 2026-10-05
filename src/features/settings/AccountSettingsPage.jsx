import {
  ProfileIdentityBlock,
  ProfileLetterheadBlock,
} from '../profile/ProfileBlocks'
import { useAppSession } from '../../lib/AppSessionContext'
import { SettingsSectionCard } from './SettingsPlaceholders'

export default function AccountSettingsPage() {
  const { session, refreshClients } = useAppSession()

  if (!session) {
    return <p className="text-muted">Sign in to edit account settings.</p>
  }

  return (
    <div className="section-card-stack">
      <ProfileIdentityBlock session={session} onSaved={refreshClients} />
      <ProfileLetterheadBlock />
      <SettingsSectionCard
        blockId="settings_subscription"
        title="Subscription"
        description="Check your plan, and cancel it."
      >
        <p className="text-muted" style={{ marginTop: 0 }}>
          Subscription is not available yet. When it is, your plan will show here, and you will be able to cancel it.
        </p>
      </SettingsSectionCard>
    </div>
  )
}
