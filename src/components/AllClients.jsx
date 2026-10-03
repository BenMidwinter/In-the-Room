import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppClients } from '../lib/queries'
import PageHeader, { PageHeaderFilter } from './PageHeader'
import { usePermissions } from '../lib/usePermissions'
import BlurredName from './BlurredName'
import RecordTable from './RecordTable'

const CLIENT_COLUMNS = [
  { key: 'name', label: 'Name', filter: { type: 'text', placeholder: 'Search name…' } },
  { key: 'context', label: 'Context', filter: { type: 'select', allLabel: 'All contexts' } },
  { key: 'dob', label: 'DOB' },
  { key: 'status', label: 'Status', filter: { type: 'select', allLabel: 'All statuses' } },
]

export default function AllClients() {
  const { clients } = useAppClients()
  const perms = usePermissions()
  const navigate = useNavigate()
  const [filterContext, setFilterContext] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortType, setSortType] = useState('date_desc')

  let displayList = clients

  if (filterContext === 'private') {
    displayList = displayList.filter(c => !c.workplace_id)
  } else if (filterContext !== 'all') {
    displayList = displayList.filter(c => c.workplace_id === filterContext)
  }

  if (searchTerm) {
    const lower = searchTerm.toLowerCase()
    displayList = displayList.filter(c => c.real_name.toLowerCase().includes(lower))
  }

  displayList = [...displayList].sort((a, b) => {
    if (sortType === 'name_asc') return a.real_name.localeCompare(b.real_name)
    if (sortType === 'name_desc') return b.real_name.localeCompare(a.real_name)
    if (sortType === 'date_asc') return new Date(a.created_at) - new Date(b.created_at)
    if (sortType === 'date_desc') return new Date(b.created_at) - new Date(a.created_at)
    return 0
  })

  const uniqueWorkplaces = [...new Map(
    clients.filter(c => c.workplace_id).map(item => [item.workplace_id, item])
  ).values()]

  const rows = displayList.map(c => ({
    id: c.id,
    client: c,
    muted: !c.is_active,
    filterValues: {
      name: c.real_name,
      context: c.workplace_id ? c.workplace_name : 'Private',
      status: c.is_active ? 'Active' : 'Discharged',
    },
    cells: {
      name: <strong><BlurredName name={c.real_name} blur={perms.blurClientIdentity} /></strong>,
      context: c.workplace_id
        ? <span className="badge badge-blue">{c.workplace_name}</span>
        : <span className="badge badge-grey">Private</span>,
      dob: c.dob,
      status: c.is_active
        ? <span className="badge badge-green">Active</span>
        : <span className="badge badge-grey">Discharged</span>,
    },
  }))

  return (
    <div className="page">
      <PageHeader
        title="All clients"
        subtitle="Full caseload history, including discharged clients."
        actions={
          (perms.canAddPrivateClient || perms.canAddWorkplaceClient) && (
            <button type="button" className="primary" onClick={() => navigate('/clients/add')}>+ New client</button>
          )
        }
        toolbar={(
          <>
            <PageHeaderFilter id="all-clients-context" label="Context">
              <select id="all-clients-context" className="paper-input" value={filterContext} onChange={e => setFilterContext(e.target.value)}>
                <option value="all">All contexts</option>
                <option value="private">Private practice</option>
                {uniqueWorkplaces.map(wp => (
                  <option key={wp.workplace_id} value={wp.workplace_id}>{wp.workplace_name}</option>
                ))}
              </select>
            </PageHeaderFilter>
            <PageHeaderFilter id="all-clients-sort" label="Sort by">
              <select id="all-clients-sort" className="paper-input" value={sortType} onChange={e => setSortType(e.target.value)}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </PageHeaderFilter>
            <PageHeaderFilter id="all-clients-search" label="Search" className="page-header__filter--grow">
              <input
                id="all-clients-search"
                type="search"
                className="paper-input"
                placeholder="Search by name…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </PageHeaderFilter>
          </>
        )}
      />

      <div className="record-module">
        <RecordTable
          columns={CLIENT_COLUMNS}
          rows={rows}
          emptyMessage="No clients found."
          onRowClick={perms.blurClientIdentity ? undefined : (row) => navigate(`/clients/${row.id}`)}
        />
      </div>
    </div>
  )
}
