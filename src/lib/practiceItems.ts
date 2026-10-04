export const PRACTICE_KINDS = ['folder', 'document'] as const

export type PracticeKind = (typeof PRACTICE_KINDS)[number]

export type PracticeItem = {
  id: string
  parent_id: string | null
  kind: PracticeKind
  name: string
  content: string
  created_at: string
  updated_at: string
}

export function practiceFolder(items: PracticeItem[], folderId: string | null): PracticeItem | null {
  if (!folderId) return null
  return items.find((item) => item.id === folderId && item.kind === 'folder') ?? null
}

export function childrenOf(items: PracticeItem[], parentId: string | null): PracticeItem[] {
  const parent = parentId || null
  return items.filter((item) => (item.parent_id || null) === parent)
}

/** Folders first, then documents, each group by name. */
export function practiceNameSortKey(item: Pick<PracticeItem, 'kind' | 'name'>): string {
  const rank = item.kind === 'folder' ? '0' : '1'
  return `${rank} ${item.name.trim().toLowerCase()}`
}

/** Folder chain from the library root down to `folderId`. Cycles are dropped. */
export function practiceBreadcrumb(items: PracticeItem[], folderId: string | null): PracticeItem[] {
  if (!folderId) return []
  const byId = new Map(items.map((item) => [item.id, item]))
  const chain: PracticeItem[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.kind === 'folder') chain.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return chain
}
