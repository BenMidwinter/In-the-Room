import SectionCard from '../../components/SectionCard'

export function SettingsSectionCard({ blockId, title, description, actions, children }) {
  return (
    <SectionCard blockId={blockId} title={title} description={description} actions={actions}>
      <div className="section-card__panel">
        {children}
      </div>
    </SectionCard>
  )
}

export { default as TwoFactorSettingsPage } from './TwoFactorSettingsPage'
