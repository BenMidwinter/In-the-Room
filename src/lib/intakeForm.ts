/** Creative arts therapy intake — seed data keyed by client id. */

export const MODALITY_OPTIONS = [
  { value: 'music', label: 'Music' },
  { value: 'art', label: 'Art' },
  { value: 'somatic', label: 'Somatic' },
  { value: 'mixed', label: 'Mixed / integrative' },
]

export const INTAKE_FORMS = {
  'client-1': {
    client_id: 'client-1',
    preferred_modalities: [
      { id: 'mod-1', label: 'Clay sculpting', detail: 'Preferred tactile medium; grounding when dysregulated' },
      { id: 'mod-2', label: 'Digital art (iPad)', detail: 'High engagement; low mess; good for transition periods' },
      { id: 'mod-3', label: 'Songwriting / lyric scribing', detail: 'Emerging strength for emotional expression' },
    ],
    sensory_sensitivities: [
      { id: 'sen-1', label: 'Auditory — loud hand dryers & corridor noise', severity: 'moderate' },
      { id: 'sen-2', label: 'Tactile — wet clay initially aversive', severity: 'mild' },
      { id: 'sen-3', label: 'Visual — fluorescent lighting in therapy room', severity: 'moderate' },
    ],
    core_themes_metaphors: [
      { id: 'theme-1', label: 'Fortress / safe place', detail: 'Recurring in artwork since session 2' },
      { id: 'theme-2', label: 'Bridge / transition', detail: 'Linked to school move anxiety' },
      { id: 'theme-3', label: 'Rhythm as regulation', detail: 'Drumming calms system before verbal processing' },
    ],
    high_sensory_sensitivity: true,
    safety_indicators: [
      { id: 'safe-1', label: 'Escalation when transition cues ignored', level: 'watch' },
    ],
    completed_at: '2026-06-19T10:00:00Z',
  },
  'client-2': {
    client_id: 'client-2',
    preferred_modalities: [
      { id: 'mod-4', label: 'Watercolour & brush work', detail: 'Calming; predictable sensory input' },
      { id: 'mod-5', label: 'Piano / melodic improvisation', detail: 'Preferred over percussion' },
    ],
    sensory_sensitivities: [
      { id: 'sen-4', label: 'Auditory — sudden volume changes', severity: 'high' },
      { id: 'sen-5', label: 'Tactile — paint on hands', severity: 'moderate' },
      { id: 'sen-6', label: 'Olfactory — strong art materials', severity: 'moderate' },
    ],
    core_themes_metaphors: [
      { id: 'theme-4', label: 'Masks / identity', detail: 'Explored in mask-making session' },
      { id: 'theme-5', label: 'Order vs chaos', detail: 'Grid drawings; need for structure' },
    ],
    high_sensory_sensitivity: true,
    safety_indicators: [
      { id: 'safe-2', label: 'Shutdown risk in overstimulating environments', level: 'watch' },
      { id: 'safe-3', label: 'Requires visual schedule before session', level: 'info' },
    ],
    completed_at: '2026-06-21T09:00:00Z',
  },
  'client-4': {
    client_id: 'client-4',
    preferred_modalities: [
      { id: 'mod-6', label: 'Movement / somatic marking', detail: 'Body-based expression when words unavailable' },
      { id: 'mod-7', label: 'Collage & found materials', detail: 'Non-directive; client-led pacing' },
    ],
    sensory_sensitivities: [
      { id: 'sen-7', label: 'Proxemics — needs wider personal space', severity: 'high' },
      { id: 'sen-8', label: 'Unexpected touch on materials', severity: 'moderate' },
    ],
    core_themes_metaphors: [
      { id: 'theme-6', label: 'Storm / weather', detail: 'Internal state externalised in imagery' },
      { id: 'theme-7', label: 'Roots & grounding', detail: 'Tree motifs in clay work' },
    ],
    high_sensory_sensitivity: true,
    safety_indicators: [
      { id: 'safe-4', label: 'Dissociation signs — monitor pacing', level: 'critical' },
      { id: 'safe-5', label: 'Safe word established: "pause"', level: 'info' },
    ],
    completed_at: '2025-11-10T11:00:00Z',
  },
}

export function getIntakeForm(clientId) {
  return INTAKE_FORMS[clientId] || null
}

/** Persistent alert tags for the client profile header. */
export function getClientClinicalAlerts(clientId) {
  const intake = getIntakeForm(clientId)
  if (!intake) return []

  const alerts: Array<{ id: string; label: string; level: string; source: string }> = []

  if (intake.high_sensory_sensitivity) {
    alerts.push({
      id: 'high-sensory',
      label: 'High sensory sensitivity',
      level: 'sensory',
      source: 'intake',
    })
  }

  for (const indicator of intake.safety_indicators || []) {
    alerts.push({
      id: indicator.id,
      label: indicator.label,
      level: indicator.level === 'critical' ? 'critical' : indicator.level === 'watch' ? 'watch' : 'info',
      source: 'intake',
    })
  }

  return alerts
}

export function formatInsertText(item, category) {
  const detail = item.detail ? ` — ${item.detail}` : ''
  const severity = item.severity ? ` (${item.severity})` : ''
  if (category === 'modality') return `Preferred modality: ${item.label}${detail}`
  if (category === 'sensitivity') return `Sensory consideration: ${item.label}${severity}${detail}`
  if (category === 'theme') return `Core theme/metaphor: ${item.label}${detail}`
  if (category === 'profile') return item.detail ? `${item.label} — ${item.detail}` : item.label
  return item.label
}
