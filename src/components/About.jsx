import { useState } from 'react'
import PageHeader from './PageHeader'
import { PRODUCT_NAME } from '../lib/brand'

export default function About() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="page">
      <PageHeader
        title={`About ${PRODUCT_NAME}`}
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
            <li>Server-side AWS KMS envelope encryption for clinical and identifying payloads</li>
            <li>Design brief lives in <code>docs/SYSTEM_ARCHITECTURE.md</code></li>
          </ul>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="card">
          <h3 className="card__title">Zero plaintext at rest</h3>
          <p className="text-muted" style={{ lineHeight: 1.8 }}>
            Clinical and identifying payloads are sealed and opened by the
            <code> clinical-record </code>
            Edge Function (
            <code>supabase/functions/clinical-record/index.ts</code>
            ) using
            <code> _shared/practiceKey.ts </code>
            (
            <code>dekFor</code>
            ,
            <code> openJson</code>
            ,
            <code> sealJson</code>
            ) and AWS KMS (
            <code>_shared/awsKms.ts</code>
            ) in
            <code> eu-west-2</code>
            . Organisation keys live in
            <code> organization_keys</code>
            . The database stores opaque ciphertext only.
          </p>
        </div>
      )}

      {activeTab === 'architecture' && (
        <div className="card">
          <h3 className="card__title">Modular structure</h3>
          <p className="text-muted" style={{ lineHeight: 1.8 }}>
            Routes stay anemic. Frontend reads and writes go through
            <code> src/lib/supabase/*Repo.ts </code>
            and
            <code> clinicalEnvelope.ts</code>
            . Business logic and editors live in
            <code> src/features/</code>
            , composed by thin page shells.
          </p>
        </div>
      )}
    </div>
  )
}
