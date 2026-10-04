import { describe, expect, it } from 'vitest'
import { renderProgressNoteDocument } from './clinicalExport'

const letterhead = {
  practiceName: 'North Practice',
  logoUrl: 'https://example.com/logo.png',
  addressLines: ['1 High Street', 'York'],
  clinicianName: 'Ada North',
  professionalTitle: 'Clinical Psychologist',
}

describe('process note print', () => {
  it('puts the practice on the right of the logo, then the clinician, the date, and the sign-off', () => {
    const html = renderProgressNoteDocument(
      {
        title: 'Session 4',
        session_date: '2026-03-15',
        content: '<p>Worked on sleep.</p>',
        status: 'signed_off',
        signed_off_at: '2026-03-15T16:30:00.000Z',
        modality_used: 'CBT',
        therapeutic_theme: 'Avoidance',
        artwork_attachments: [{ name: 'drawing.png' }],
      },
      { clientName: 'Selena Gauche', letterhead },
    )

    expect(html).toContain('Fraunces')
    expect(html).toContain('Karla')
    expect(html).toContain('.clinical-pdf blockquote')
    expect(html).toContain('.expr-size--voice')
    expect(html).toContain('letterhead__identity')
    expect(html).toContain('letterhead__logo')
    expect(html).toContain('clinical-pdf__body')
    expect(html).toContain('Worked on sleep.')
    expect(html).toContain('North Practice')
    expect(html).toContain('1 High Street')
    expect(html).toContain('Ada North')
    expect(html).toContain('Clinical Psychologist')
    expect(html).toContain('letterhead__rule')
    expect(html).toContain('Selena Gauche')
    expect(html).toContain('15 March 2026')
    expect(html).toContain('Signed off')
    expect(html).not.toContain('Modality')
    expect(html).not.toContain('Therapeutic theme')
    expect(html).not.toContain('Avoidance')
    expect(html).not.toContain('drawing.png')
    expect(html).not.toContain('Author')
    expect(html).not.toContain('United Kingdom')
    expect(html).not.toContain('Private practice')
    expect(html.indexOf('letterhead__logo')).toBeLessThan(html.indexOf('Ada North'))
    expect(html.indexOf('Ada North')).toBeLessThan(html.indexOf('>North Practice<'))
  })

  it('prints the note body and any addendum under the letterhead', () => {
    const html = renderProgressNoteDocument(
      {
        title: 'Session 2',
        session_date: '2026-02-02',
        content: '<p>Talked about school.</p>',
        status: 'signed_off',
        signed_off_at: '2026-02-02T10:00:00.000Z',
        addendums: [{ id: 'a1', body: '<p>Later clarification.</p>', created_at: '2026-02-10T09:00:00.000Z' }],
      },
      { clientName: 'Selena Gauche', letterhead },
    )

    expect(html).toContain('Talked about school.')
    expect(html).toContain('Later clarification.')
    expect(html).toContain('Addendum')
  })

  it('omits a blank practice name and does not invent a clinician label', () => {
    const html = renderProgressNoteDocument(
      {
        title: 'Session 1',
        session_date: '2026-01-02',
        content: '<p>Hello</p>',
        status: 'draft',
      },
      {
        clientName: 'Selena Gauche',
        letterhead: {
          practiceName: '',
          logoUrl: '',
          addressLines: [],
          clinicianName: '',
          professionalTitle: '',
        },
      },
    )

    expect(html).toContain('<header class="letterhead"><hr class="letterhead__rule" /></header>')
    expect(html).not.toContain('Clinician')
    expect(html).not.toContain('Signed off')
    expect(html).toContain('2 January 2026')
  })
})
