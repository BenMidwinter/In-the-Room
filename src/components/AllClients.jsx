import { useNavigate } from 'react-router-dom'
import { useAppClients } from '../lib/queries'
import { formatDisplayDate } from '../lib/dateArchitecture'
import PageHeader from './PageHeader'
import RecordTable from './RecordTable'

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
      muted: !client.is_active,
      filterValues: {
        name: client.real_name,
        gender: client.gender || '',
        status: client.is_active ? 'Active' : 'Discharged',
      },
      sortValues: {
        name: client.real_name,
        dob: client.dob || '',
        gender: client.gender || '',
        status: client.is_active ? 'Active' : 'Discharged',
      },
      cells: {
        name: <span className="record-table__primary">{client.real_name}</span>,
        dob: formatDisplayDate(client.dob) || client.dob || '—',
        gender: client.gender?.trim() || '—',
        status: client.is_active
          ? <span className="badge badge-green">Active</span>
          : <span className="badge badge-grey">Discharged</span>,
      },
    }))

  return (
    <div className="page">
      <PageHeader
        title="All clients"
        subtitle="Everyone you have worked with, including discharged clients."
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
