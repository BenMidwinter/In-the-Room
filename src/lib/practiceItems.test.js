import { describe, expect, it } from 'vitest'
import { childrenOf, practiceBreadcrumb, practiceNameSortKey } from './practiceItems'

const items = [
  { id: 'root-folder', parent_id: null, kind: 'folder', name: 'Supervision', content: '', created_at: '', updated_at: '' },
  { id: 'nested', parent_id: 'root-folder', kind: 'folder', name: '2026', content: '', created_at: '', updated_at: '' },
  { id: 'note', parent_id: 'nested', kind: 'document', name: 'October', content: '<p>Hi</p>', created_at: '', updated_at: '' },
  { id: 'loose', parent_id: null, kind: 'document', name: 'Invoice draft', content: '<p></p>', created_at: '', updated_at: '' },
]

describe('practice library tree', () => {
  it('lists only the children of a folder', () => {
    expect(childrenOf(items, null).map((item) => item.id)).toEqual(['root-folder', 'loose'])
    expect(childrenOf(items, 'nested').map((item) => item.id)).toEqual(['note'])
    expect(childrenOf(items, 'missing')).toEqual([])
  })

  it('builds a breadcrumb and ignores a cycle', () => {
    expect(practiceBreadcrumb(items, 'nested').map((item) => item.name)).toEqual(['Supervision', '2026'])
    expect(practiceBreadcrumb(items, null)).toEqual([])
    const cycled = [
      { id: 'a', parent_id: 'b', kind: 'folder', name: 'A', content: '', created_at: '', updated_at: '' },
      { id: 'b', parent_id: 'a', kind: 'folder', name: 'B', content: '', created_at: '', updated_at: '' },
    ]
    expect(practiceBreadcrumb(cycled, 'a').map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('sorts folders ahead of documents', () => {
    const keys = items.map(practiceNameSortKey).sort()
    expect(keys[0].startsWith('0 ')).toBe(true)
    expect(keys.at(-1).startsWith('1 ')).toBe(true)
  })
})
