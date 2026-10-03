import { describe, it, expect, beforeEach } from 'vitest'
import { DEMO_PERSONAS, DEFAULT_PERSONA_ID, getPersonaForRole } from './demoPersonas'
import { DEMO_PERSONA_ACCOUNTS } from './mockData'
import { ROLES } from './permissions'
import {
  resetStore,
  getWorkplaceContextsForUser,
  getClientsForUser,
  getMyWorkplace,
  getOrganisationWorkplaceContexts,
} from './store'

beforeEach(() => {
  resetStore()
})

describe('demo persona store wiring', () => {
  it('builds switcher personas from mockData accounts', () => {
    expect(DEMO_PERSONAS.map(p => p.id).sort()).toEqual(Object.keys(DEMO_PERSONA_ACCOUNTS).sort())
    expect(DEFAULT_PERSONA_ID).toBe('ben')
  })

  it('gives Ben clinical-lead memberships and workplace caseload', () => {
    const ben = getPersonaForRole(ROLES.CLINICAL_LEAD)
    expect(ben?.userId).toBe('user-ben')

    const contexts = getWorkplaceContextsForUser('user-ben')
    expect(contexts).toHaveLength(2)

    const workplace = getMyWorkplace('user-ben', 'wp-chroma')
    const clients = getClientsForUser('user-ben', {
      ...workplace,
      effectiveRole: ROLES.CLINICAL_LEAD,
    })
    expect(clients.length).toBeGreaterThan(2)
  })

  it('gives Daniel service-lead org contexts without workplace memberships', () => {
    const daniel = getPersonaForRole(ROLES.SERVICE_LEAD)
    expect(daniel?.userId).toBe('user-daniel')
    expect(getWorkplaceContextsForUser('user-daniel')).toHaveLength(0)
    expect(getOrganisationWorkplaceContexts()).toHaveLength(2)
  })
})
