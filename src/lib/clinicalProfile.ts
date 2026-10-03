import { parseCommaTags } from './commaTags'

export interface ClinicalProfile {
  recurring_themes?: string
  sensory_considerations?: string
  preferred_modalities_notes?: string
  clinical_goals?: string
  working_formulation?: string
}

export interface ClientClinicalRecord {
  diagnosis?: string
  medication?: string
  school?: string
  clinical_profile?: ClinicalProfile
}

/** Normalised clinical profile field keys (stored on client.clinical_profile). */
export const CLINICAL_PROFILE_FIELDS = {
  recurring_themes: {
    label: 'Recurring themes & metaphors',
    insightTitle: 'Themes & metaphors',
    mergeKey: 'recurring_themes',
    tagField: true,
  },
  sensory_considerations: {
    label: 'Sensory profile & considerations',
    insightTitle: 'Sensory considerations',
    mergeKey: 'sensory_considerations',
    tagField: true,
  },
  preferred_modalities_notes: {
    label: 'Preferred modalities',
    insightTitle: 'Preferred modalities',
    mergeKey: 'preferred_modalities',
    tagField: true,
  },
  clinical_goals: {
    label: 'Clinical goals',
    insightTitle: 'Clinical goals',
    mergeKey: 'clinical_goals',
    tagField: true,
  },
  working_formulation: {
    label: 'Working formulation',
    insightTitle: 'Working formulation',
    mergeKey: 'working_formulation',
    tagField: false,
  },
}

export function tagsFromProfileValue(value: string | null | undefined): string[] {
  if (!value?.trim()) return []
  return parseCommaTags(value)
}

/** Flat tag list for profile header chips (deduped). */
export function getClinicalProfileTagLabels(clinicalProfile: ClinicalProfile | null | undefined): string[] {
  if (!clinicalProfile) return []
  const tags: string[] = []
  const tagKeys: (keyof ClinicalProfile)[] = [
    'sensory_considerations',
    'recurring_themes',
    'clinical_goals',
    'preferred_modalities_notes',
  ]
  for (const key of tagKeys) {
    for (const tag of tagsFromProfileValue(clinicalProfile[key])) {
      if (!tags.includes(tag)) tags.push(tag)
    }
  }
  return tags
}

function profileValueToInsightItems(
  value: string | null | undefined,
  prefix: string,
  { tagField }: { tagField: boolean },
) {
  if (!value?.trim()) return []
  if (tagField) {
    return tagsFromProfileValue(value).map((label, index) => ({
      id: `${prefix}-tag-${index}`,
      label,
      source: 'profile',
    }))
  }
  return [{
    id: `${prefix}-text`,
    label: value.trim(),
    detail: 'Working formulation',
    source: 'profile',
  }]
}

/**
 * Insight sections from saved client.clinical_profile — for sidebar insert & display.
 */
export function getClinicalProfileInsightSections(clinicalProfile: ClinicalProfile | null | undefined) {
  if (!clinicalProfile) return []

  return Object.entries(CLINICAL_PROFILE_FIELDS)
    .map(([key, meta]) => ({
      key,
      title: meta.insightTitle,
      items: profileValueToInsightItems(clinicalProfile[key as keyof ClinicalProfile], key, meta),
    }))
    .filter(section => section.items.length > 0)
}

/** Merge field values from client record + clinical profile. */
export function clinicalProfileMergeValues(client: ClientClinicalRecord | null | undefined) {
  const cp = client?.clinical_profile || {}
  return {
    client_diagnosis: client?.diagnosis || '',
    client_medication: client?.medication || '',
    client_school: client?.school || '',
    recurring_themes: cp.recurring_themes || '',
    sensory_considerations: cp.sensory_considerations || '',
    working_formulation: cp.working_formulation || '',
    clinical_goals: cp.clinical_goals || '',
    preferred_modalities: cp.preferred_modalities_notes || '',
  }
}
