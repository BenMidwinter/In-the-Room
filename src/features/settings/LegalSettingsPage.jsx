import { Navigate, useParams } from 'react-router-dom'
import DpaDocument from '../legal/DpaDocument'
import { SettingsSectionCard } from './SettingsPlaceholders'

const DOCUMENTS = {
  dpa: 'agreement',
  privacy: 'Privacy policy',
  terms: 'Terms and conditions',
}

export default function LegalSettingsPage() {
  const { doc } = useParams()
  if (!DOCUMENTS[doc]) return <Navigate to="/settings/legal/dpa" replace />

  if (doc === 'dpa') {
    return <DpaDocument embedded />
  }

  return (
    <SettingsSectionCard blockId={`settings_legal_${doc}`} title={DOCUMENTS[doc]}>
      <p className="text-muted" style={{ marginTop: 0 }}>
        This document has not been added yet.
      </p>
    </SettingsSectionCard>
  )
}
