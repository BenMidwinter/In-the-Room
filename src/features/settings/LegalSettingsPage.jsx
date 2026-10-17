import { Navigate, useParams } from 'react-router-dom'
import DpaDocument from '../legal/DpaDocument'
import PrivacyDocument from '../legal/PrivacyDocument'
import TermsDocument from '../legal/TermsDocument'

const DOCUMENTS = {
  dpa: DpaDocument,
  privacy: PrivacyDocument,
  terms: TermsDocument,
}

export default function LegalSettingsPage() {
  const { doc } = useParams()
  const Document = DOCUMENTS[doc]
  if (!Document) return <Navigate to="/settings/legal/dpa" replace />
  return <Document embedded />
}
