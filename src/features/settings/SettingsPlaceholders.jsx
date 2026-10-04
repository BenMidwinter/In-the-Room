import SectionCard from '../../components/SectionCard'

export function SettingsSectionCard({ blockId, title, children }) {
  return (
    <SectionCard blockId={blockId} title={title}>
      <div className="section-card__panel">
        {children}
      </div>
    </SectionCard>
  )
}

export function TwoFactorSettingsPage() {
  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId="settings_2fa" title="Two-factor authentication">
        <p className="text-muted" style={{ marginTop: 0 }}>
          TOTP-based 2FA via Supabase Auth MFA will live here. Enrollment UI follows once Google connect is testable.
        </p>
      </SettingsSectionCard>
    </div>
  )
}
