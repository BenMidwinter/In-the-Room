import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from './ui'
import { useAppSession } from '../lib/AppSessionContext'
import { formatDisplayDate } from '../lib/dateArchitecture'
import { useAppClients } from '../lib/queries'
import { acceptWaitlistClient } from '../lib/supabase/clientsRepo'
import PageHeader from './PageHeader'
import RecordTable from './RecordTable'

const COLUMNS = [
  { key: 'name', label: 'Name', filter: 'text' },
  { key: 'dob', label: 'Date of birth', sort: 'date' },
  { key: 'gender', label: 'Gender', filter: 'text' },
  { key: 'added', label: 'Added', sort: 'date' },
  { key: 'accept', label: '', sort: false, className: 'record-table__col--actions' },
]

export default function WaitlistPage() {
  const { clients } = useAppClients()
  const { refreshClients } = useAppSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [acceptingId, setAcceptingId] = useState(null)
  const waiting = clients.filter((client) => client.on_waitlist)

  const accept = async (event, client) => {
    event.stopPropagation()
    setAcceptingId(client.id)
    try {
      await acceptWaitlistClient(client.id)
      refreshClients()
      toast.saved(`${client.real_name} is on your client list.`)
    } catch (err) {
      toast.error(err.message || 'Could not accept this person')
    } finally {
      setAcceptingId(null)
    }
  }

  const rows = [...waiting]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((client) => ({
      id: client.id,
      client,
      filterValues: {
        name: client.real_name,
        gender: client.gender || '',
      },
      sortValues: {
        name: client.real_name,
        dob: client.dob || '',
        gender: client.gender || '',
        added: client.created_at || '',
      },
      cells: {
        name: <span className="record-table__primary">{client.real_name}</span>,
        dob: formatDisplayDate(client.dob) || client.dob || '—',
        gender: client.gender?.trim() || '—',
        added: formatDisplayDate(String(client.created_at || '').slice(0, 10)) || '—',
        accept: (
          <button
            type="button"
            className="secondary"
            disabled={acceptingId === client.id}
            onClick={(event) => accept(event, client)}
          >
            {acceptingId === client.id ? 'Accepting…' : 'Accept'}
          </button>
        ),
      },
    }))

  return (
    <div className="page">
      <PageHeader
        title="Waitlist"
        subtitle="People who sent an intake form, waiting to be screened."
      />
      <RecordTable
        columns={COLUMNS}
        rows={rows}
        countNoun="people"
        defaultSort={{ key: 'added', direction: 'asc' }}
        emptyMessage="Nobody is waiting. An intake form adds someone here when they send it."
        onRowClick={(row) => navigate(`/clients/${row.id}`)}
      />
    </div>
  )
}
