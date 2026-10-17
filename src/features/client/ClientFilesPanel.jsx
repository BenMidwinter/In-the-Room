import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import RowMenu from '../../components/RowMenu'
import { useConfirm, useToast } from '../../components/ui'
import {
  deleteClientFile,
  downloadClientFile,
  listClientFiles,
  uploadClientFile,
} from '../../lib/supabase/clientFilesRepo'
import { useClientSession } from '../../lib/useClientSession'

const COLUMNS = [
  { key: 'name', label: 'File name', filter: 'text' },
  { key: 'type', label: 'Type', filter: 'text' },
  { key: 'size', label: 'Size', sort: 'number' },
  { key: 'date', label: 'Uploaded', sort: 'date' },
  { key: 'actions', label: '', sort: false, className: 'record-table__col--actions' },
]

function formatWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function typeLabel(file) {
  const name = file.file_name || ''
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : ''
  return ext || file.file_type || 'File'
}

export default function ClientFilesPanel() {
  const { clientId } = useClientSession()
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const { data: files = [], isPending, error } = useQuery({
    queryKey: ['client-files', clientId],
    queryFn: () => listClientFiles(clientId),
    enabled: Boolean(clientId),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['client-files', clientId] })

  const onPick = async (list) => {
    const chosen = [...(list || [])]
    if (!chosen.length || !clientId) return
    setUploading(true)
    try {
      for (const file of chosen) {
        await uploadClientFile(clientId, file)
      }
      toast.saved(chosen.length === 1 ? 'File stored' : 'Files stored')
      await refresh()
    } catch (err) {
      toast.error(err?.message || 'The file could not be stored.')
      await refresh()
    } finally {
      setUploading(false)
    }
  }

  const remove = async (file) => {
    const ok = await confirm({
      title: 'Delete file',
      message: `Delete ${file.file_name}? This removes it from the client record.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteClientFile(file.id)
      toast.saved('File deleted')
      await refresh()
    } catch (err) {
      toast.error(err?.message || 'The file could not be deleted.')
    }
  }

  const rows = files.map((file) => ({
    id: file.id,
    filterValues: {
      name: file.file_name,
      type: typeLabel(file),
    },
    sortValues: {
      name: file.file_name,
      type: typeLabel(file),
      size: Number(file.file_size_bytes) || 0,
      date: file.created_at || '',
    },
    cells: {
      name: <span className="record-table__primary">{file.file_name}</span>,
      type: typeLabel(file),
      size: formatSize(file.file_size_bytes),
      date: formatWhen(file.created_at),
      actions: (
        <RowMenu
          label={`Actions for ${file.file_name}`}
          items={[
            {
              label: 'Download',
              onSelect: () => downloadClientFile(file.id).catch((err) => toast.error(err?.message || 'The file could not be downloaded.')),
            },
            { label: 'Delete', danger: true, onSelect: () => remove(file) },
          ]}
        />
      ),
    },
  }))

  return (
    <RecordListLayout
      title="Files"
      subtitle="Files are stored privately in London. The upload link lasts five minutes and the download link lasts one minute."
      newLabel="file"
      onNew={() => { if (!uploading) inputRef.current?.click() }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="image/*,.pdf,.txt,.rtf,.doc,.docx,.xls,.xlsx"
        onChange={(event) => {
          onPick(event.target.files)
          event.target.value = ''
        }}
      />
      {error && <p className="form-error" role="alert">{error.message || 'Could not load files.'}</p>}
      {uploading && <p className="text-muted">Storing the file…</p>}
      {!error && (
        <RecordTable
          remember={`client-files-${clientId}`}
          columns={COLUMNS}
          rows={rows}
          countNoun="files"
          defaultSort={{ key: 'date', direction: 'desc' }}
          emptyMessage={isPending ? 'Loading files…' : 'No files yet.'}
        />
      )}
    </RecordListLayout>
  )
}
