import { useState } from 'react'
import PageHeader from './PageHeader'

export default function About() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="page">
      <PageHeader
        title="About In the Room"
      />

      <div className="tabs">
        {['overview', 'security', 'architecture'].map(tab => (
          <button
            key={tab}
            type="button"
            className={`tab${activeTab === tab ? ' tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' ? 'Overview' : tab === 'security' ? 'Security' : 'Architecture'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="card">
          <h3 className="card__title">What this is</h3>
          <ul className="text-muted" style={{ paddingLeft: '1.25rem', lineHeight: 1.9 }}>
            <li>Freelance clinician workspace for clients, sessions, notes, and calendar</li>
            <li>Thin-page shells with encapsulated feature modules</li>
            <li>Client-side encryption before any clinical data reaches Supabase</li>
            <li>Design brief lives in <code>docs/SYSTEM_ARCHITECTURE.md</code></li>
          </ul>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="card">
          <h3 className="card__title">Zero plaintext at rest</h3>
          <p className="text-muted" style={{ lineHeight: 1.8 }}>
            Sensitive clinical text and identifiers are encrypted in the browser with WebCrypto
            before network calls. The database only stores opaque ciphertext. See the project
            security directives for envelope encryption, RLS, and key-handling rules.
          </p>
        </div>
      )}

      {activeTab === 'architecture' && (
        <div className="card">
          <h3 className="card__title">Modular structure</h3>
          <p className="text-muted" style={{ lineHeight: 1.8 }}>
            Routes stay anemic. Business logic, editor state, and crypto binds live in
            <code> src/features/</code> and <code>src/modules/</code> blocks, composed by thin page shells.
          </p>
        </div>
      )}
    </div>
  )
}
