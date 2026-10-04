import { useState } from 'react'
import LettersPanel from './LettersPanel'
import WorkingDocumentsPanel from './WorkingDocumentsPanel'
import { useClientChrome } from './ClientChrome'

export default function ClientDocumentsPage() {
  const [tab, setTab] = useState('letters')
  const chrome = useClientChrome()
  const editing = Boolean(chrome?.editorOpen)

  return (
    <div className="documents-page">
      {!editing && (
        <>
          <header className="course-page__header">
            <div>
              <h2>Documents</h2>
            </div>
          </header>
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
        </>
      )}
      {tab === 'letters' ? <LettersPanel /> : <WorkingDocumentsPanel />}
    </div>
  )
}
