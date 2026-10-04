import { describe, expect, it } from 'vitest'
import { choiceOptions, filterRows, sortRows } from './recordTableQuery'

const columns = [
  { key: 'name', label: 'Name', filter: 'text' },
  { key: 'date', label: 'Date', sort: 'date' },
  { key: 'status', label: 'Status', filter: 'choice' },
]

const rows = [
  {
    id: '1',
    filterValues: { name: 'Selena Gauche', status: 'Active', date: '4 Oct 2026' },
    sortValues: { date: '2026-10-04' },
    cells: { name: 'Selena Gauche' },
  },
  {
    id: '2',
    filterValues: { name: 'Ada North', status: 'Discharged', date: '2 Jan 2026' },
    sortValues: { date: '2026-01-02' },
    cells: { name: 'Ada North' },
  },
  {
    id: '3',
    filterValues: { name: 'Ben Oak', status: 'Active', date: '' },
    sortValues: { date: '' },
    cells: { name: 'Ben Oak' },
  },
]

describe('record table query', () => {
  it('filters text by contains and choice by an exact value', () => {
    expect(filterRows(rows, columns, { name: 'sel' }).map((row) => row.id)).toEqual(['1'])
    expect(filterRows(rows, columns, { status: 'Active' }).map((row) => row.id)).toEqual(['1', '3'])
  })

  it('sorts dates and keeps blank values at the end', () => {
    expect(sortRows(rows, columns[1], 'asc').map((row) => row.id)).toEqual(['2', '1', '3'])
    expect(sortRows(rows, columns[1], 'desc').map((row) => row.id)).toEqual(['1', '2', '3'])
  })

  it('lists choice values without blanks', () => {
    expect(choiceOptions(rows, 'status')).toEqual(['Active', 'Discharged'])
  })
})
