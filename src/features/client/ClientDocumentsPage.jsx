import { useSearchParams } from 'react-router-dom'
import LettersPanel from './LettersPanel'
import WorkingDocumentsPanel from './WorkingDocumentsPanel'

export default function ClientDocumentsPage() {
  const [params] = useSearchParams()
  const tab = params.get('type') === 'working' ? 'working' : 'letters'

  return (
    <div className="documents-page">
      {tab === 'letters'
        ? <LettersPanel embedded />
        : <WorkingDocumentsPanel embedded />}
    </div>
  )
}
