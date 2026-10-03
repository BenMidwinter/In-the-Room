import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useClientSession } from '../../lib/useClientSession'
import { getEpisodes } from '../../lib/store'
import { usePermissions } from '../../lib/usePermissions'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useToast } from '../../components/ui'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABELS = {
  active: 'Active',
  discharged: 'Discharged',
  paused: 'Paused',
}

const EPISODE_COLUMNS = [
  { key: 'episode', label: 'Episode' },
  { key: 'referral', label: 'Referral date', filter: { type: 'text', placeholder: 'Filter date…' } },
  { key: 'status', label: 'Status', filter: { type: 'select', allLabel: 'All statuses' } },
  { key: 'source', label: 'Referral source', filter: { type: 'text', placeholder: 'Filter source…' } },
  { key: 'issue', label: 'Presenting issue', filter: { type: 'text', placeholder: 'Filter issue…' } },
]

export default function CaseHistoryPanel() {
  const { id: clientId } = useParams()
  const { client } = useClientSession()
  const perms = usePermissions(client)
  const toast = useToast()
  const episodes = getEpisodes(clientId)
  const [selectedId, setSelectedId] = useState(episodes[0]?.id ?? null)
  const selected = episodes.find(e => e.id === selectedId)

  const rows = episodes.map(ep => ({
    id: ep.id,
    episode: ep,
    muted: ep.status === 'discharged',
    filterValues: {
      referral: formatDate(ep.referral_date),
      status: STATUS_LABELS[ep.status] || ep.status,
      source: ep.referral_source || '—',
      issue: ep.presenting_issue || '—',
    },
    cells: {
      episode: <span className="record-table__primary">Episode {ep.episode_number}</span>,
      referral: formatDate(ep.referral_date),
      status: (
        <span className={`badge ${ep.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
          {STATUS_LABELS[ep.status] || ep.status}
        </span>
      ),
      source: ep.referral_source || '—',
      issue: (
        <span className="record-table__cell-muted">
          {(ep.presenting_issue || '—').slice(0, 80)}{(ep.presenting_issue?.length > 80 ? '…' : '')}
        </span>
      ),
    },
  }))

  return (
    <RecordListLayout
      title="Case history"
      subtitle="Referral episodes and care pathways for this client."
      newLabel={perms.canStartNewCase ? 'case' : undefined}
      onNew={perms.canStartNewCase
        ? () => toast.info('Start new case — episode creation will connect to Supabase.')
        : undefined}
      headerActions={!perms.canStartNewCase ? (
        <span className="text-small text-muted">New workplace cases require clinical lead or administrator</span>
      ) : undefined}
      editor={selected && (
        <div className="card episode-detail">
          <div className="episode-detail__header">
            <h3>Episode {selected.episode_number}</h3>
            <span className={`badge ${selected.status === 'active' ? 'badge-green' : 'badge-grey'}`}>
              {STATUS_LABELS[selected.status] || selected.status}
            </span>
          </div>
          <dl className="episode-detail__grid">
            <div>
              <dt>Referral date</dt>
              <dd>{formatDate(selected.referral_date)}</dd>
            </div>
            <div>
              <dt>Referral source</dt>
              <dd>{selected.referral_source || '—'}</dd>
            </div>
            <div>
              <dt>Episode start</dt>
              <dd>{formatDate(selected.start_date)}</dd>
            </div>
            <div>
              <dt>Episode end</dt>
              <dd>{formatDate(selected.end_date)}</dd>
            </div>
            <div className="episode-detail__full">
              <dt>Presenting issue</dt>
              <dd>{selected.presenting_issue || '—'}</dd>
            </div>
            {selected.discharge_summary && (
              <div className="episode-detail__full">
                <dt>Discharge summary</dt>
                <dd>{selected.discharge_summary}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    >
      <RecordTable
        columns={EPISODE_COLUMNS}
        rows={rows}
        emptyMessage="No episodes recorded yet. Referrals will create new episodes automatically."
        onRowClick={(row) => setSelectedId(row.id)}
        selectedId={selectedId}
      />
    </RecordListLayout>
  )
}
