import { ROLES } from './permissions'
import {
  CLINICIAN_PROFILES,
  DEMO_PERSONA_ACCOUNTS,
  DEFAULT_DEMO_PERSONA_ID,
} from './mockData'
import { buildMergeContext } from './mergeFields'

/** Single freelance clinician identity — no multi-role demo switcher. */
export const DEMO_PERSONAS = Object.entries(DEMO_PERSONA_ACCOUNTS).map(([id, account]) => {
  const profile = CLINICIAN_PROFILES.find(p => p.id === account.userId)
  return {
    id,
    name: account.name,
    role: ROLES.CLINICIAN,
    userId: account.userId,
    jobTitle: profile?.job_title || 'Creative Arts Therapist',
    label: 'Clinician',
    serviceLead: false,
  }
})

export const DEFAULT_PERSONA_ID = DEFAULT_DEMO_PERSONA_ID

export function getPersonaById(personaId: string) {
  return DEMO_PERSONAS.find(p => p.id === personaId) || DEMO_PERSONAS[0]
}

export function getPersonaForRole(role: string) {
  return DEMO_PERSONAS.find(p => p.role === role) || DEMO_PERSONAS[0] || null
}

export function getProfileForPersona(persona: { userId?: string } | null) {
  if (!persona) return null
  return CLINICIAN_PROFILES.find(p => p.id === persona.userId) || null
}

/** Merge-field preview context for template editors (no seeded client data). */
export function buildDemoTemplateMergeContext() {
  const clinician = DEMO_PERSONAS[0]
  const profile = getProfileForPersona(clinician)
  return buildMergeContext({
    client: undefined,
    appointment: undefined,
    profile: profile
      ? {
          full_name: profile.full_name,
          job_title: profile.job_title,
          hcpc_number: profile.hcpc_number,
        }
      : null,
    sessionDate: undefined,
  })
}

export function shouldBlurClientIdentity(_persona: unknown) {
  return false
}

export function getPersonaVisibilitySummary(persona: { name?: string }, visibleCount: number, totalCount: number) {
  const hidden = totalCount - visibleCount
  if (hidden <= 0) {
    return `${persona?.name || 'You'} can see all ${totalCount} clients.`
  }
  return `${persona?.name || 'You'} can see ${visibleCount} of ${totalCount} clients.`
}
