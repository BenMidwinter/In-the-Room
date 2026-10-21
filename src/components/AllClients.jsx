import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppClients, useStoreRefreshers } from '../lib/queries'
import { formatDisplayDate } from '../lib/dateArchitecture'
import PageHeader from './PageHeader'
import RecordTable from './RecordTable'
import RowMenu from './RowMenu'
import BulkStatusBar from './BulkStatusBar'
import StatusBadge from './StatusBadge'
import ExportDialog from '../features/export/ExportDialog'
import { useConfirm, useToast } from './ui'
import { useRowSelection } from '../hooks/useRowSelection'
import { permanentlyDeleteClient, setClientStatus } from '../lib/supabase/clientsRepo'
import {
  STATUS_COLUMN,
  STATUS_DEFAULT_FILTERS,
  bulkActionsForStatus,
  recordStatusOf,
  statusLabelOf,
  statusMenuItems,
  trashCountdownLabel,
} from '../lib/recordStatus'

function caseloadStatus(client) {
  if (client.on_screener || client.status === 'screener') return 'Screener'
  if (client.on_waitlist || client.status === 'waitlist') return 'Waitlist'
  if (client.status === 'closed') return 'Closed'
  if (client.status === 'rejected') return 'Rejected'
  if (client.is_active) return 'Active'
  return 'Discharged'
}

const CLIENT_COLUMNS = [
  { key: 'name', label: 'Name', filter: 'text' },
  { key: 'dob', label: 'Date of birth', sort: 'date' },
  { key: 'gender', label: 'Gender', filter: 'text' },
  { key: 'status', label: 'Status', filter: 'choice' },
  STATUS_COLUMN,
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

function deleteWarning(name, permanent) {
  if (permanent) {
    return `This removes ${name} now, and every record on their file. Notes, letters, appointments, invoices, and files stored in London are deleted. This cannot be undone. Export a copy first if you still need one.`
  }
  return `This starts a 30-day countdown for ${name}. When it ends, the client and every record on their file are removed, including notes, letters, appointments, invoices, and files stored in London. Export a copy first if you still need one.`
}

export default function AllClients() {
  const { clients } = useAppClients()
  const { refreshClients } = useStoreRefreshers()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [statusFilter, setStatusFilter] = useState('Active')
  const [exportClient, setExportClient] = useState(null)
  const { selectedIds, selection, clear: clearSelection, count: selectedCount } = useRowSelection()

  const openClient = (client) => navigate(`/clients/${client.id}`)

  const moveStatus = async (client, nextStatus, toastLabel) => {
    try {
      await setClientStatus(client.id, nextStatus)
      clearSelection()
      await refreshClients()
      toast.saved(toastLabel)
    } catch (err) {
      toast.error(err?.message || 'Could not update this client')
    }
  }

  const askToDelete = async (client, permanent) => {
    const ok = await confirm({
      title: permanent ? `Permanently delete ${client.real_name}?` : `Delete ${client.real_name}?`,
      message: deleteWarning(client.real_name, permanent),
      confirmLabel: permanent ? 'Permanently delete' : 'Delete client',
      altLabel: 'Export first',
      tone: 'danger',
    })
    if (ok === 'export') {
      setExportClient(client)
      return
    }
    if (!ok) return
    if (permanent) {
      try {
        await permanentlyDeleteClient(client.id)
        clearSelection()
        await refreshClients()
        toast.saved('Client permanently deleted')
      } catch (err) {
        toast.error(err?.message || 'Could not delete this client')
      }
      return
    }
    await moveStatus(client, 'trash', 'Client moved to trash')
  }

  const runBulk = async (action) => {
    const targets = clients.filter((client) => selectedIds.includes(client.id))
    for (const client of targets) {
      // eslint-disable-next-line no-await-in-loop
      await action(client)
    }
  }

  const bulk = bulkActionsForStatus(statusFilter, {
    onArchive: () => runBulk((client) => moveStatus(client, 'archive', 'Clients archived')),
    onRestore: () => runBulk((client) => moveStatus(client, 'active', 'Clients restored')),
    onDelete: async () => {
      const targets = clients.filter((client) => selectedIds.includes(client.id))
      if (!targets.length) return
      const ok = await confirm({
        title: targets.length === 1 ? `Delete ${targets[0].real_name}?` : `Delete ${targets.length} clients?`,
        message: targets.length === 1
          ? deleteWarning(targets[0].real_name, false)
          : 'This starts a 30-day countdown. When it ends, each selected client and every record on their file are removed, including files stored in London. Export anyone you still need from their row menu before you continue.',
        confirmLabel: 'Delete client',
        altLabel: targets.length === 1 ? 'Export first' : undefined,
        tone: 'danger',
      })
      if (ok === 'export' && targets.length === 1) {
        setExportClient(targets[0])
        return
      }
      if (!ok) return
      await runBulk((client) => moveStatus(client, 'trash', 'Clients moved to trash'))
    },
    onRestoreToArchive: () => runBulk((client) => moveStatus(client, 'archive', 'Clients restored to archive')),
    onPermanentDelete: async () => {
      const targets = clients.filter((client) => selectedIds.includes(client.id))
      if (!targets.length) return
      const ok = await confirm({
        title: targets.length === 1 ? `Permanently delete ${targets[0].real_name}?` : `Permanently delete ${targets.length} clients?`,
        message: targets.length === 1
          ? deleteWarning(targets[0].real_name, true)
          : 'This removes each selected client now, and every record on their file, including files stored in London. This cannot be undone. Export anyone you still need from their row menu before you continue.',
        confirmLabel: 'Permanently delete',
        altLabel: targets.length === 1 ? 'Export first' : undefined,
        tone: 'danger',
      })
      if (ok === 'export' && targets.length === 1) {
        setExportClient(targets[0])
        return
      }
      if (!ok) return
      try {
        await runBulk((client) => permanentlyDeleteClient(client.id))
        clearSelection()
        await refreshClients()
        toast.saved('Clients permanently deleted')
      } catch (err) {
        toast.error(err?.message || 'Could not delete these clients')
      }
    },
  })

  const rows = [...clients]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((client) => {
      const lifecycle = recordStatusOf(client)
      const countdown = lifecycle === 'trash' ? trashCountdownLabel(client.trashed_at) : null
      return {
        id: client.id,
        client,
        muted: lifecycle !== 'active',
        filterValues: {
          name: client.real_name,
          gender: client.gender || '',
          status: caseloadStatus(client),
          state: statusLabelOf(client),
        },
        sortValues: {
          name: client.real_name,
          dob: client.dob || '',
          gender: client.gender || '',
          status: caseloadStatus(client),
          state: statusLabelOf(client),
        },
        cells: {
          name: <span className="record-table__primary">{client.real_name}</span>,
          dob: formatDisplayDate(client.dob) || client.dob || '—',
          gender: client.gender?.trim() || '—',
          status: client.on_screener
            ? <span className="badge badge-blue">Screener</span>
            : client.on_waitlist
              ? <span className="badge badge-grey">Waitlist</span>
              : client.status === 'closed'
                ? <span className="badge badge-grey">Closed</span>
                : client.status === 'rejected'
                  ? <span className="badge badge-grey">Rejected</span>
                  : client.is_active
                    ? <span className="badge badge-green">Active</span>
                    : <span className="badge badge-grey">Discharged</span>,
          state: (
            <span>
              <StatusBadge status={lifecycle} />
              {countdown ? <span className="text-small text-muted"> {countdown}</span> : null}
            </span>
          ),
          actions: (
            <RowMenu
              label={`Actions for ${client.real_name}`}
              items={statusMenuItems(lifecycle, {
                onEdit: () => openClient(client),
                onView: () => openClient(client),
                onArchive: () => moveStatus(client, 'archive', 'Client archived'),
                onRestore: () => moveStatus(client, 'active', 'Client restored'),
                onDelete: () => askToDelete(client, false),
                onRestoreToArchive: () => moveStatus(client, 'archive', 'Client restored to archive'),
                onPermanentDelete: () => askToDelete(client, true),
              })}
            />
          ),
        },
      }
    })

  return (
    <div className="page">
      <PageHeader
        title="All clients"
        help="Everyone on your list, including the screener, the waitlist, and people you have discharged. Archive keeps a client out of the working list. Delete starts a 30-day countdown, then removes the client and every record and stored file."
      />

      <BulkStatusBar
        count={selectedCount}
        noun="clients"
        actions={bulk}
        onClear={clearSelection}
      />

      <div className="tray-action-row">
        <button type="button" className="primary" onClick={() => navigate('/clients/add')}>New client</button>
      </div>

      <RecordTable
        remember="clients"
        columns={CLIENT_COLUMNS}
        rows={rows}
        countNoun="clients"
        defaultFilters={STATUS_DEFAULT_FILTERS}
        onFiltersChange={(filters) => setStatusFilter(filters.state || 'Active')}
        selection={selection}
        emptyMessage="No clients yet."
        onRowClick={(row) => openClient(row.client)}
      />

      {exportClient && (
        <ExportDialog
          scope="client"
          clientId={exportClient.id}
          onClose={() => setExportClient(null)}
        />
      )}
    </div>
  )
}
