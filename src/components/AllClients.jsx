import { useNavigate } from 'react-router-dom'
import { useAppClients } from '../lib/queries'
import { formatDisplayDate } from '../lib/dateArchitecture'
import PageHeader from './PageHeader'
import RecordTable from './RecordTable'

function caseloadStatus(client) {
  if (client.on_waitlist) return 'Waitlist'
  if (client.is_active) return 'Active'
  return 'Discharged'
}

const CLIENT_COLUMNS = [
  { key: 'name', label: 'Name', filter: 'text' },
  { key: 'dob', label: 'Date of birth', sort: 'date' },
  { key: 'gender', label: 'Gender', filter: 'text' },
  { key: 'status', label: 'Status', filter: 'choice' },
]

export default function AllClients() {
  const { clients } = useAppClients()
  const navigate = useNavigate()

  const rows = [...clients]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((client) => ({
      id: client.id,
      client,
      muted: !client.is_active && !client.on_waitlist,
      filterValues: {
        name: client.real_name,
        gender: client.gender || '',
        status: caseloadStatus(client),
      },
      sortValues: {
        name: client.real_name,
        dob: client.dob || '',
        gender: client.gender || '',
        status: caseloadStatus(client),
      },
      cells: {
        name: <span className="record-table__primary">{client.real_name}</span>,
        dob: formatDisplayDate(client.dob) || client.dob || '—',
        gender: client.gender?.trim() || '—',
        status: client.on_waitlist
          ? <span className="badge badge-blue">Waitlist</span>
          : client.is_active
            ? <span className="badge badge-green">Active</span>
            : <span className="badge badge-grey">Discharged</span>,
      },
    }))

  return (
    <div className="page">
      <PageHeader
        title="All clients"
        subtitle="Everyone on your list, including people waiting to be seen and people you have discharged."
        actions={(
          <button type="button" className="primary" onClick={() => navigate('/clients/add')}>New client</button>
        )}
      />

      <RecordTable
        columns={CLIENT_COLUMNS}
        rows={rows}
        countNoun="clients"
        emptyMessage="No clients yet."
        onRowClick={(row) => navigate(`/clients/${row.id}`)}
      />
    </div>
  )
}
