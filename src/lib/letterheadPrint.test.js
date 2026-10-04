import { describe, expect, it, vi } from 'vitest'
import { addressLinesFromLetterhead, resolveDownloadLetterhead } from './letterheadPrint'

const identity = { clinicianName: 'Ada North', professionalTitle: 'Clinical Psychologist' }

function row(overrides) {
  return {
    id: 'lh-1',
    owner_id: 'user-1',
    name: 'North Practice',
    practice_name: 'North Practice',
    logo_url: null,
    address_line1: '1 High Street',
    address_line2: null,
    address_line3: 'York',
    postcode: 'YO1 1AA',
    country: '',
    is_default: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('letterhead print', () => {
  it('keeps only the address lines that were typed', () => {
    expect(addressLinesFromLetterhead(row({ country: '  ' }))).toEqual([
      '1 High Street',
      'York',
      'YO1 1AA',
    ])
    expect(addressLinesFromLetterhead(null)).toEqual([])
  })

  it('prints the clinician only when there is no letterhead', async () => {
    const choose = vi.fn()
    const letterhead = await resolveDownloadLetterhead([], choose, identity)
    expect(choose).not.toHaveBeenCalled()
    expect(letterhead).toEqual({
      practiceName: '',
      logoUrl: '',
      addressLines: [],
      clinicianName: 'Ada North',
      professionalTitle: 'Clinical Psychologist',
    })
  })

  it('uses the only letterhead without asking', async () => {
    const choose = vi.fn()
    const letterhead = await resolveDownloadLetterhead([row({})], choose, identity)
    expect(choose).not.toHaveBeenCalled()
    expect(letterhead?.practiceName).toBe('North Practice')
    expect(letterhead?.addressLines).not.toContain('United Kingdom')
  })

  it('asks which letterhead to use, and cancel stops the download', async () => {
    const choose = vi.fn().mockResolvedValue(null)
    const rows = [
      row({ id: 'a', name: 'North Practice', is_default: true }),
      row({ id: 'b', name: 'School clinic', is_default: false }),
    ]
    const letterhead = await resolveDownloadLetterhead(rows, choose, identity)
    expect(letterhead).toBeNull()
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Which letterhead?',
      defaultValue: 'a',
      confirmLabel: 'Download',
    }))
  })

  it('prints the letterhead that was chosen', async () => {
    const choose = vi.fn().mockResolvedValue('b')
    const rows = [
      row({ id: 'a', name: 'North Practice', is_default: true }),
      row({ id: 'b', name: 'School clinic', practice_name: 'School clinic', is_default: false, address_line1: 'School lane' }),
    ]
    const letterhead = await resolveDownloadLetterhead(rows, choose, identity)
    expect(letterhead?.practiceName).toBe('School clinic')
    expect(letterhead?.addressLines).toContain('School lane')
  })
})
