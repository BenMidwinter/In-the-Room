import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import SectionNav from '../../components/SectionNav'

const SECTIONS = [
  { to: '/practice/documents', label: 'My Documents' },
  { to: '/practice/journal', label: 'Journal' },
  { to: '/practice/cpd', label: 'CPD log' },
  { to: '/practice/supervision', label: 'Supervision log' },
]

export default function PracticeLayout() {
  const location = useLocation()
  const [editorOpen, setEditorOpen] = useState(false)
  const [seenPath, setSeenPath] = useState(location.pathname)
  if (location.pathname !== seenPath) {
    setSeenPath(location.pathname)
    setEditorOpen(false)
  }

  return (
    <div className="page page--practice">
      <div className="page-mast">
        <PageHeader title="My Practice" />
        {!editorOpen && <SectionNav label="Practice sections" items={SECTIONS} />}
      </div>

      <div className="client-layout">
        <div className="client-layout__main">
          <Outlet context={{ setEditorOpen }} />
        </div>
      </div>
    </div>
  )
}
