import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LettersPanel from './LettersPanel'
import WorkingDocumentsPanel from './WorkingDocumentsPanel'

const LATER = [
  { to: 'files', label: '[Files]' },
  { to: 'forms', label: '[Forms]' },
  { to: 'contacts', label: '[Contacts]' },
  { to: 'outcomes', label: '[Outcome measures]' },
]

export default function ClientDocumentsPage() {
  const { id: clientId } = useParams()
  const [tab, setTab] = useState('letters')

  return (
    <div className="documents-page">
      <header className="course-page__header">
        <div>
          <h2>Documents</h2>
          <p>Letters and working documents for this client. Reports stay on the course they belong to.</p>
        </div>
      </header>
      <p className="documents-page__later">
        {LATER.map((item) => (
          <Link key={item.to} to={`/clients/${clientId}/${item.to}`}>{item.label}</Link>
        ))}
      </p>
      <div className="documents-page__tabs" role="tablist" aria-label="Document types">
        <button
          type="button"
          className={tab === 'letters' ? 'primary' : 'secondary'}
          onClick={() => setTab('letters')}
        >
          Letters
        </button>
        <button
          type="button"
          className={tab === 'working' ? 'primary' : 'secondary'}
          onClick={() => setTab('working')}
        >
          Working documents
        </button>
      </div>
      {tab === 'letters' ? <LettersPanel /> : <WorkingDocumentsPanel />}
    </div>
  )
}
