export function columnFilterKind(column) {
  const filter = column?.filter
  if (!filter) return null
  if (filter === 'text' || filter.type === 'text') return 'text'
  if (filter === 'choice' || filter.type === 'select' || filter.type === 'choice') return 'choice'
  return 'text'
}

export function columnSortKind(column) {
  if (column?.sort === false) return null
  if (column?.sort === 'date' || column?.sort === 'number' || column?.sort === 'text') return column.sort
  return 'text'
}

export function rowSortValue(row, key) {
  if (row?.sortValues && Object.prototype.hasOwnProperty.call(row.sortValues, key)) {
    return row.sortValues[key]
  }
  if (row?.filterValues && Object.prototype.hasOwnProperty.call(row.filterValues, key)) {
    return row.filterValues[key]
  }
  const cell = row?.cells?.[key]
  if (typeof cell === 'string' || typeof cell === 'number') return cell
  return ''
}

function isEmptySortValue(value) {
  return value == null || String(value).trim() === '' || value === '—'
}

export function compareSortValues(a, b, kind) {
  const aEmpty = isEmptySortValue(a)
  const bEmpty = isEmptySortValue(b)
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  if (kind === 'number') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function filterRows(rows, columns, filters) {
  const active = columns.filter((col) => {
    if (!columnFilterKind(col)) return false
    return String(filters?.[col.key] || '').trim()
  })
  if (!active.length) return rows
  return rows.filter((row) => active.every((col) => {
    const query = String(filters[col.key]).trim().toLowerCase()
    const value = String(row.filterValues?.[col.key] ?? rowSortValue(row, col.key) ?? '').trim().toLowerCase()
    if (columnFilterKind(col) === 'choice') return value === query
    return value.includes(query)
  }))
}

export function sortRows(rows, column, direction) {
  if (!column || (direction !== 'asc' && direction !== 'desc')) return rows
  const kind = columnSortKind(column)
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aValue = rowSortValue(a.row, column.key)
      const bValue = rowSortValue(b.row, column.key)
      const aEmpty = isEmptySortValue(aValue)
      const bEmpty = isEmptySortValue(bValue)
      if (aEmpty || bEmpty) {
        if (aEmpty && bEmpty) return a.index - b.index
        return aEmpty ? 1 : -1
      }
      const cmp = compareSortValues(aValue, bValue, kind)
      if (cmp === 0) return a.index - b.index
      return direction === 'desc' ? -cmp : cmp
    })
    .map((item) => item.row)
}

export function choiceOptions(rows, key) {
  const values = new Set()
  rows.forEach((row) => {
    const value = String(row.filterValues?.[key] ?? '').trim()
    if (value && value !== '—') values.add(value)
  })
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
