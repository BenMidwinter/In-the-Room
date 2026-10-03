/** Parse a comma-delimited string into trimmed tag labels. */
export function parseCommaTags(value: string | null | undefined): string[] {
  if (!value?.trim()) return []
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Join tag labels into a comma-delimited string. */
export function joinCommaTags(tags: (string | null | undefined)[]): string {
  return tags.filter(Boolean).join(', ')
}
