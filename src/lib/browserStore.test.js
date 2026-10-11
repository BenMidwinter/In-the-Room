import { describe, expect, it, beforeEach } from 'vitest'
import { readPref, resetBrowserStoreForTests, writePref } from './browserStore'
import { hasAppHistory } from './useGoBack'

describe('browser store', () => {
  beforeEach(() => {
    resetBrowserStoreForTests()
  })

  it('keeps a preference for the next read', () => {
    writePref('calendar.view', 'month')
    expect(readPref('calendar.view')).toBe('month')
  })

  it('stores table filters and sorting as plain data', () => {
    writePref('table.clients', {
      filters: { status: 'Active' },
      sort: { key: 'name', direction: 'asc' },
    })
    expect(readPref('table.clients')).toEqual({
      filters: { status: 'Active' },
      sort: { key: 'name', direction: 'asc' },
    })
  })

  it('leaves an unknown key empty', () => {
    expect(readPref('calendar.view')).toBeUndefined()
  })
})

describe('hasAppHistory', () => {
  it('treats a fresh tab as having nowhere to go back to', () => {
    expect(hasAppHistory('default')).toBe(false)
    expect(hasAppHistory('')).toBe(false)
  })

  it('treats an in-app visit as a previous screen', () => {
    expect(hasAppHistory('abc123')).toBe(true)
  })
})
