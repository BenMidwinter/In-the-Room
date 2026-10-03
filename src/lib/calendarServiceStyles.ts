import { getOrgServiceForModality } from './store'
import { defaultServiceColor } from './serviceColors'

/** Fallback hex when no org service matches (legacy modalities). */
const MODALITY_FALLBACK_COLORS = {
  music_therapy: '#557a61',
  clay_work: '#8b5a7a',
  somatic_expression: '#7c6b9e',
}

const MODALITY_FALLBACK_LABELS = {
  music_therapy: 'Music Therapy',
  clay_work: 'Clay Work',
  somatic_expression: 'Somatic Expression',
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

export function appointmentServiceColor(modalityId) {
  const service = getOrgServiceForModality(modalityId)
  if (service?.color) return service.color
  if (service) return defaultServiceColor(String(service.service_type))
  return MODALITY_FALLBACK_COLORS[String(modalityId)] || defaultServiceColor('appointment')
}

export function appointmentServiceLabel(modalityId) {
  const service = getOrgServiceForModality(modalityId)
  if (service) return service.name
  return MODALITY_FALLBACK_LABELS[String(modalityId)] || modalityId
}

export function calendarEventStyle(modalityId) {
  const color = appointmentServiceColor(modalityId)
  const { r, g, b } = hexToRgb(color)
  const textR = Math.max(0, Math.round(r * 0.35))
  const textG = Math.max(0, Math.round(g * 0.35))
  const textB = Math.max(0, Math.round(b * 0.35))

  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
    borderLeftColor: color,
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    color: `rgb(${textR}, ${textG}, ${textB})`,
  }
}

export function calendarLegendStyle(modalityId) {
  const color = appointmentServiceColor(modalityId)
  const { r, g, b } = hexToRgb(color)
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
    color: `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`,
  }
}

export function calendarDotStyle(modalityId) {
  return { backgroundColor: appointmentServiceColor(modalityId) }
}
