import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  choiceOptions,
  columnFilterKind,
  columnSortKind,
  filterRows,
  sortRows,
} from './recordTableQuery'

function SortMark({ direction }) {
  return (
    <span className="record-table__sort-mark" aria-hidden>
      <span className={direction === 'asc' ? 'up is-active' : 'up'} />
      <span className={direction === 'desc' ? 'down is-active' : 'down'} />
    </span>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M1.5 2.5h13l-5 6.1V13l-3 1.2V8.6l-5-6.1z"
      />
    </svg>
  )
}

function FilterPopover({
  column,
  value,
  options,
  anchorRef,
  onChange,
  onClose,
}) {
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const [box, setBox] = useState(null)
  const kind = columnFilterKind(column)
  const titleId = useId()

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 256
      const height = kind === 'choice' ? 240 : 120
      let left = rect.right - width
      if (left < 8) left = 8
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
      let top = rect.bottom + 6
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
      setBox({ top, left, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, kind])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event) => {
      const target = event.target
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [anchorRef, onClose])

  if (!box) return null

  return createPortal(
    <div
      ref={panelRef}
      className="record-table__popover"
      role="dialog"
      aria-labelledby={titleId}
      style={{ top: box.top, left: box.left, width: box.width }}
    >
      <p id={titleId} className="record-table__popover-title">Filter {column.label}</p>
      {kind === 'choice' ? (
        <ul className="record-table__choices">
          <li>
            <button
              type="button"
              className={!value ? 'record-table__choice record-table__choice--on' : 'record-table__choice'}
              onClick={() => { onChange(''); onClose() }}
            >
              Any
            </button>
          </li>
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                className={value === option ? 'record-table__choice record-table__choice--on' : 'record-table__choice'}
                onClick={() => { onChange(option); onClose() }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <input
          ref={inputRef}
          type="search"
          className="paper-input record-table__popover-input"
          value={value}
          placeholder={column.filter?.placeholder || `Filter ${column.label.toLowerCase()}`}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {value ? (
        <div className="record-table__popover-actions">
          <button type="button" className="secondary" onClick={() => { onChange(''); onClose() }}>
            Clear
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

/**
 * Shared table for caseload and client records.
 * Sort from the column arrows. Filter from the funnel, which opens a small panel.
 */
export default function RecordTable({
  columns,
  rows,
  emptyMessage = 'Nothing to show yet.',
  filteredEmptyMessage = 'Nothing matches these filters.',
  onRowClick,
  selectedId = null,
  className = '',
  defaultSort = null,
  countNoun = 'rows',
  scroll = false,
  headerAction = null,
}) {
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState(() => (
    defaultSort?.key ? { key: defaultSort.key, direction: defaultSort.direction === 'asc' ? 'asc' : 'desc' } : null
  ))
  const [openFilter, setOpenFilter] = useState(null)
  const filterButtonRefs = useRef({})

  const filtered = useMemo(
    () => filterRows(rows, columns, filters),
    [rows, columns, filters],
  )
  const sortColumn = columns.find((col) => col.key === sort?.key && columnSortKind(col))
  const displayRows = useMemo(
    () => sortRows(filtered, sortColumn, sort?.direction),
    [filtered, sortColumn, sort?.direction],
  )
  const activeFilterCount = Object.values(filters).filter((value) => String(value || '').trim()).length
  const openColumn = columns.find((col) => col.key === openFilter) || null

  const toggleSort = (column) => {
    if (!columnSortKind(column)) return
    setSort((current) => {
      if (current?.key !== column.key) {
        const first = column.sortFirst || (column.sort === 'date' ? 'desc' : 'asc')
        return { key: column.key, direction: first }
      }
      return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  const clearFilters = () => {
    setFilters({})
    setOpenFilter(null)
  }

  const countLabel = activeFilterCount
    ? `${displayRows.length} of ${rows.length} ${countNoun}`
    : `${rows.length} ${countNoun}`

  return (
    <div className={['record-table-wrap', scroll ? 'record-table-wrap--scroll' : '', className].filter(Boolean).join(' ')}>
      <table className="record-table">
        <thead>
          <tr>
            {columns.map((col, index) => {
              const sortable = Boolean(columnSortKind(col))
              const filterKind = columnFilterKind(col)
              const active = Boolean(String(filters[col.key] || '').trim())
              const direction = sort?.key === col.key ? sort.direction : null
              const actionHere = Boolean(headerAction) && index === columns.length - 1
              return (
                <th
                  key={col.key}
                  className={[
                    col.hideOnMobile ? 'record-table__col--mobile-hide' : '',
                    col.className,
                    actionHere ? 'record-table__head-action' : '',
                  ].filter(Boolean).join(' ') || undefined}
                  aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
                >
                  <div className={actionHere ? 'record-table__head record-table__head--action' : 'record-table__head'}>
                    {sortable ? (
                      <button type="button" className="record-table__sort" onClick={() => toggleSort(col)}>
                        <span>{col.label}</span>
                        <SortMark direction={direction} />
                      </button>
                    ) : col.label ? (
                      <span className="record-table__label">{col.label}</span>
                    ) : null}
                    {actionHere ? headerAction : null}
                    {filterKind ? (
                      <button
                        type="button"
                        ref={(node) => { filterButtonRefs.current[col.key] = node }}
                        className={[
                          'record-table__filter-btn',
                          active ? 'record-table__filter-btn--on' : '',
                          openFilter === col.key ? 'record-table__filter-btn--open' : '',
                        ].filter(Boolean).join(' ')}
                        aria-label={`Filter ${col.label}`}
                        aria-expanded={openFilter === col.key}
                        onClick={() => setOpenFilter((current) => (current === col.key ? null : col.key))}
                      >
                        <FilterIcon />
                      </button>
                    ) : null}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td className="record-table__empty" colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : !displayRows.length ? (
            <tr>
              <td className="record-table__empty" colSpan={columns.length}>
                {filteredEmptyMessage}
                {' '}
                <button type="button" className="record-table__inline" onClick={clearFilters}>
                  Clear filters
                </button>
              </td>
            </tr>
          ) : displayRows.map((row) => {
            const clickable = Boolean(onRowClick)
            const selected = selectedId != null && row.id === selectedId
            return (
              <tr
                key={row.id}
                className={[
                  clickable ? 'record-table__row--clickable' : '',
                  selected ? 'record-table__row--selected' : '',
                  row.muted ? 'record-table__row--muted' : '',
                ].filter(Boolean).join(' ') || undefined}
                onClick={clickable ? () => onRowClick(row) : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? (event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRowClick(row)
                  }
                } : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      col.hideOnMobile ? 'record-table__col--mobile-hide' : '',
                      col.className,
                    ].filter(Boolean).join(' ') || undefined}
                  >
                    {row.cells[col.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > 0 && (
        <p className="record-table__count">{countLabel}</p>
      )}
      {openColumn ? (
        <FilterPopover
          column={openColumn}
          value={filters[openColumn.key] || ''}
          options={choiceOptions(rows, openColumn.key)}
          anchorRef={{ current: filterButtonRefs.current[openColumn.key] }}
          onChange={(value) => setFilters((current) => ({ ...current, [openColumn.key]: value }))}
          onClose={() => setOpenFilter(null)}
        />
      ) : null}
    </div>
  )
}
