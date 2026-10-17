import { useState } from 'react'
import SectionNav from '../../components/SectionNav'
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
        <SectionNav
          label="Document types"
          items={[
            { key: 'letters', label: 'Letters', active: tab === 'letters', onSelect: () => setTab('letters') },
            { key: 'working', label: 'Working documents', active: tab === 'working', onSelect: () => setTab('working') },
          ]}
        />
      )}
      {tab === 'letters' ? <LettersPanel /> : <WorkingDocumentsPanel />}
    </div>
  )
}
