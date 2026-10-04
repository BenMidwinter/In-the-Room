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

export function FormsSettingsPage() {
  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId="settings_forms" title="Forms">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Clinician-designed forms (intake/onboarding that can create clients, plus information-gathering)
          are the next larger build alongside Rich Text Editor improvements.
        </p>
        <ul className="settings-roadmap">
          <li>Form builder with field schema stored on <code>form_definitions</code></li>
          <li>Shareable / embeddable submission links</li>
          <li>Onboarding submissions that create a client + timeline event</li>
          <li>RTE polish for Process Notes, letters, reports, and working documents</li>
        </ul>
        <p className="text-small text-muted" style={{ marginBottom: 0 }}>
          Tracked as next major workstream — not stubbed further until Account, Services, and Google sync are solid.
        </p>
      </SettingsSectionCard>
    </div>
  )
}

export function TemplateKindPage({ kind, title, blurb }) {
  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId={`settings_templates_${kind}`} title={title}>
        <p className="text-muted" style={{ marginTop: 0 }}>{blurb}</p>
        <p className="text-small text-muted" style={{ marginBottom: 0 }}>
          Templates persist to <code>templates</code> (<code>kind = {kind}</code>). Editor UX ships with the RTE workstream.
        </p>
      </SettingsSectionCard>
    </div>
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
