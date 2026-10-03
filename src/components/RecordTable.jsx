import { useMemo, useState } from 'react'

const thClass = (col) => [
  'px-3 py-2 text-left text-[0.68rem] font-bold uppercase tracking-wide text-subtle whitespace-nowrap',
  col.hideOnMobile ? 'hidden md:table-cell' : '',
  col.className,
].filter(Boolean).join(' ')

const tdClass = (col) => [
  'border-b border-line-light px-3 py-2.5 align-middle text-ink',
  col.hideOnMobile ? 'hidden md:table-cell' : '',
  col.className,
].filter(Boolean).join(' ')

/**
 * Universal tabular list for client records, caseload, and org data.
 */
export default function RecordTable({
  columns,
  rows,
  emptyMessage = 'Nothing to show yet.',
  filteredEmptyMessage = 'No rows match the current filters.',
  onRowClick,
  selectedId = null,
  className = '',
}) {
  const filterableColumns = useMemo(
    () => columns.filter(col => col.filter),
    [columns],
  )

  const [filters, setFilters] = useState(() =>
    Object.fromEntries(filterableColumns.map(col => [col.key, ''])),
  )

  const selectOptions = useMemo(() => {
    const options = {}
    filterableColumns.forEach(col => {
      if (col.filter?.type !== 'select') return
      const values = new Set()
      rows.forEach(row => {
        const value = row.filterValues?.[col.key]?.trim()
        if (value) values.add(value)
      })
      options[col.key] = [...values].sort((a, b) => a.localeCompare(b))
    })
    return options
  }, [rows, filterableColumns])

  const filteredRows = useMemo(() => {
    if (!filterableColumns.length) return rows
    return rows.filter(row =>
      filterableColumns.every(col => {
        const filterValue = filters[col.key]?.trim()
        if (!filterValue) return true
        const rowValue = (row.filterValues?.[col.key] || '').trim()
        if (col.filter?.type === 'select') {
          return rowValue.toLowerCase() === filterValue.toLowerCase()
        }
        return rowValue.toLowerCase().includes(filterValue.toLowerCase())
      }),
    )
  }, [rows, filters, filterableColumns])

  const hasActiveFilters = Object.values(filters).some(Boolean)
  const displayRows = filteredRows
  const displayEmptyMessage = rows.length && !displayRows.length && hasActiveFilters
    ? filteredEmptyMessage
    : emptyMessage

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const filterInputClass =
    'w-full min-w-0 rounded-sm border border-line bg-surface px-2 py-1.5 text-sm text-ink'

  const renderHeader = () => (
    <thead>
      <tr className="border-b border-line-strong">
        {columns.map(col => (
          <th key={col.key} className={thClass(col)}>
            {col.label}
          </th>
        ))}
      </tr>
      {filterableColumns.length > 0 && (
        <tr>
          {columns.map(col => {
            if (!col.filter) {
              return (
                <th key={`filter-${col.key}`} className={thClass(col)} aria-hidden />
              )
            }

            if (col.filter.type === 'select') {
              return (
                <th key={`filter-${col.key}`} className={thClass(col)}>
                  <label className="block">
                    <span className="sr-only">Filter {col.label}</span>
                    <select
                      className={filterInputClass}
                      value={filters[col.key] || ''}
                      onChange={e => updateFilter(col.key, e.target.value)}
                      onClick={e => e.stopPropagation()}
                    >
                      <option value="">{col.filter.allLabel || 'All'}</option>
                      {(selectOptions[col.key] || []).map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </th>
              )
            }

            return (
              <th key={`filter-${col.key}`} className={thClass(col)}>
                <label className="block">
                  <span className="sr-only">Filter {col.label}</span>
                  <input
                    type="search"
                    className={filterInputClass}
                    value={filters[col.key] || ''}
                    onChange={e => updateFilter(col.key, e.target.value)}
                    placeholder={col.filter.placeholder || 'Filter…'}
                    onClick={e => e.stopPropagation()}
                  />
                </label>
              </th>
            )
          })}
        </tr>
      )}
    </thead>
  )

  if (!rows.length) {
    return (
      <div className={`w-full overflow-x-auto ${className}`.trim()}>
        <table className="w-full border-collapse text-sm leading-snug">
          {renderHeader()}
          <tbody>
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-subtle">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={`w-full overflow-x-auto ${className}`.trim()}>
      <table className="w-full border-collapse text-sm leading-snug">
        {renderHeader()}
        <tbody>
          {!displayRows.length ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-subtle">
                {displayEmptyMessage}
              </td>
            </tr>
          ) : displayRows.map(row => {
            const clickable = Boolean(onRowClick)
            const selected = selectedId != null && row.id === selectedId
            return (
              <tr
                key={row.id}
                className={[
                  'even:bg-zone-muted',
                  clickable ? 'cursor-pointer hover:bg-zone-accent' : '',
                  selected ? 'bg-primary/10' : '',
                  row.muted ? 'opacity-60' : '',
                ].filter(Boolean).join(' ') || undefined}
                onClick={clickable ? () => onRowClick(row) : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick(row)
                  }
                } : undefined}
              >
                {columns.map(col => (
                  <td key={col.key} className={tdClass(col)}>
                    {row.cells[col.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
