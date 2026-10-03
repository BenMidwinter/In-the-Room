import { describe, expect, it } from 'vitest'
import { getServiceLeadPageMeta } from './serviceLeadPages'

describe('getServiceLeadPageMeta', () => {
  it('resolves overview route', () => {
    const meta = getServiceLeadPageMeta('/service-lead')
    expect(meta.title).toBe('Organisation overview')
  })

  it('resolves config routes', () => {
    expect(getServiceLeadPageMeta('/service-lead/workplaces').title).toBe('Workplaces')
    expect(getServiceLeadPageMeta('/service-lead/users').title).toBe('Users')
  })

  it('resolves template editor routes', () => {
    expect(getServiceLeadPageMeta('/service-lead/progress-note-templates/new').title)
      .toBe('New progress note template')
    expect(getServiceLeadPageMeta('/service-lead/progress-note-templates/tpl-1').title)
      .toBe('Edit progress note template')
  })

  it('falls back for unknown paths', () => {
    expect(getServiceLeadPageMeta('/service-lead/unknown').title).toBe('Service Lead')
  })
})
