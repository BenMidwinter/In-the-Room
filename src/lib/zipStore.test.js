import { describe, expect, it } from 'vitest'
import { crc32, zipStore } from '../../supabase/functions/_shared/zipStore.ts'

function text(value) {
  return new TextEncoder().encode(value)
}

describe('zipStore', () => {
  it('writes a stored zip that names every file', () => {
    const zip = zipStore([
      { path: 'contents.txt', data: text('contents.txt\nnotes/one.html\n') },
      { path: 'notes/one.html', data: text('<p>Hello</p>') },
    ], new Date('2026-10-17T12:00:00Z'))
    const bytes = [...zip]
    const signature = bytes.slice(0, 4)
    expect(signature).toEqual([0x50, 0x4b, 0x03, 0x04])
    const decoded = new TextDecoder().decode(zip)
    expect(decoded).toContain('contents.txt')
    expect(decoded).toContain('notes/one.html')
    expect(decoded).toContain('<p>Hello</p>')
    expect(crc32(text('Hello'))).toBe(crc32(text('Hello')))
  })
})
