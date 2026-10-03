import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useToast } from '../../components/ui'

/**
 * Consistent list shell for record types not yet fully implemented.
 */
export default function ClientSectionPlaceholder({
  title,
  description,
  newLabel,
  columns = [],
}) {
  const toast = useToast()
  const defaultColumns = columns.length
    ? columns
    : [
      { key: 'name', label: 'Name' },
      { key: 'date', label: 'Date' },
      { key: 'author', label: 'Created by' },
    ]

  return (
    <RecordListLayout
      title={title}
      subtitle={description}
      newLabel={newLabel}
      onNew={() => toast.info(`${newLabel || title} creation will connect to the backend.`)}
    >
      <RecordTable
        columns={defaultColumns}
        rows={[]}
        emptyMessage={`No ${title.toLowerCase()} yet.`}
      />
    </RecordListLayout>
  )
}
