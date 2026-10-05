import { describe, expect, it } from 'vitest'
import { formDocumentBlocks, formDocumentBodyHtml } from './formDocument'

describe('completed form document', () => {
  it('keeps the clinician’s section text and the answers', () => {
    const blocks = formDocumentBlocks(
      {
        v: 1,
        blocks: [
          { id: 'intro', type: 'prose', text: 'This form starts a referral.' },
          { id: 'name', type: 'client', bind: 'first_name', label: 'First name' },
        ],
      },
      { name: 'Ada' },
      {},
    )
    expect(blocks[0]).toEqual({ kind: 'prose', text: 'This form starts a referral.' })
    expect(blocks[1].text).toBe('Ada')
    expect(formDocumentBodyHtml(blocks)).toContain('This form starts a referral.')
    expect(formDocumentBodyHtml(blocks)).toContain('Ada')
  })
})
