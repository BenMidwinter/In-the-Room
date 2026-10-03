import { describe, expect, it } from 'vitest'
import { isServiceLeadNavItemActive } from './serviceLeadNav'

describe('isServiceLeadNavItemActive', () => {
  it('marks overview only on exact path', () => {
    expect(isServiceLeadNavItemActive('/service-lead', { to: '/service-lead', end: true })).toBe(true)
    expect(isServiceLeadNavItemActive('/service-lead/workplaces', { to: '/service-lead', end: true })).toBe(false)
  })

  it('marks template editors via matchPrefix', () => {
    const item = {
      to: '/service-lead/progress-note-templates',
      matchPrefix: '/service-lead/progress-note-templates',
    }
    expect(isServiceLeadNavItemActive('/service-lead/progress-note-templates', item)).toBe(true)
    expect(isServiceLeadNavItemActive('/service-lead/progress-note-templates/new', item)).toBe(true)
    expect(isServiceLeadNavItemActive('/service-lead/letter-templates', item)).toBe(false)
  })
})
