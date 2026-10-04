import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppClients } from '../lib/queries'
import PageHeader, { PageHeaderFilter } from './PageHeader'
import RecordTable from './RecordTable'

const CLIENT_COLUMNS = [
  { key: 'name', label: 'Name', filter: { type: 'text', placeholder: 'Search name…' } },
  { key: 'dob', label: 'DOB' },
]

export default function ActiveCases() {
  const { clients } = useAppClients()
  const navigate = useNavigate()
  const [sortType, setSortType] = useState('date_desc')

  const activeClients = clients.filter(c => c.is_active)

  let displayList = [...activeClients].sort((a, b) => {
    if (sortType === 'name_asc') return a.real_name.localeCompare(b.real_name)
    if (sortType === 'name_desc') return b.real_name.localeCompare(a.real_name)
    if (sortType === 'date_asc') return new Date(a.created_at) - new Date(b.created_at)
    if (sortType === 'date_desc') return new Date(b.created_at) - new Date(a.created_at)
    return 0
  })

  const rows = displayList.map(c => ({
    id: c.id,
    client: c,
    filterValues: {
      name: c.real_name,
    },
    cells: {
      name: <strong>{c.real_name}</strong>,
      dob: c.dob,
    },
  }))

  return (
    <div className="page">
      <PageHeader
        title="Active cases"
        subtitle="Your current caseload."
        actions={(
          <button type="button" className="primary" onClick={() => navigate('/clients/add')}>+ New client</button>
        )}
        toolbar={(
          <>
            <PageHeaderFilter id="active-cases-sort" label="Sort by">
              <select id="active-cases-sort" className="paper-input" value={sortType} onChange={e => setSortType(e.target.value)}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </PageHeaderFilter>
          </>
        )}
      />

      <div className="record-module">
        <RecordTable
          columns={CLIENT_COLUMNS}
          rows={rows}
          emptyMessage="No active clients found."
          onRowClick={(row) => navigate(`/clients/${row.id}`)}
        />
      </div>
    </div>
  )
}
