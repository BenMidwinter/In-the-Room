import { getOrgServiceForModality } from './store'
import { defaultServiceColor } from './serviceColors'

/** Fallback hex when no org service matches (legacy modalities). */
const MODALITY_FALLBACK_COLORS = {
  music_therapy: '#557a61',
  clay_work: '#8b5a7a',
  somatic_expression: '#7c6b9e',
  external_busy: '#6b7280',
}

const MODALITY_FALLBACK_LABELS = {
  music_therapy: 'Music Therapy',
  clay_work: 'Clay Work',
  somatic_expression: 'Somatic Expression',
  external_busy: 'Busy',
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
  const key = String(modalityId || '')
  if (MODALITY_FALLBACK_LABELS[key]) return MODALITY_FALLBACK_LABELS[key]
  // Never render raw UUIDs / single-letter slugs as the chip title.
  if (/^[0-9a-f-]{36}$/i.test(key)) return 'Session'
  if (key.length <= 2) return 'Session'
  return key
}

/** Prefer embedded service_name, then catalogue lookup — never fall back to a junk modality slug. */
export function appointmentDisplayName(appointment, fallback = 'Session') {
  const embedded = String(appointment?.service_name || '').trim()
  if (embedded) return embedded
  const fromCatalog = appointmentServiceLabel(
    appointment?.service_id || appointment?.therapy_modality,
  )
  if (fromCatalog && fromCatalog !== 'Session') return fromCatalog
  return fallback
}

/** Client initials for compact calendar chips, e.g. "Selena Gauche" → "SG". */
export function clientInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/** Calendar chip title: "SG: Music Therapy". */
export function appointmentChipLabel(appointment) {
  if (appointment?.is_external_busy) return 'Busy'
  const embeddedName = String(appointment?.service_name || '').trim()
  const service = embeddedName || appointmentServiceLabel(
    appointment?.service_id || appointment?.therapy_modality,
  )
  if (appointment?.block_role === 'support' || appointment?.block_role === 'admin') {
    return service
  }
  const initials = clientInitials(appointment?.client_name)
  return `${initials}: ${service}`
}

export function calendarEventStyle(modalityId, appointment) {
  const key = appointment?.service_id || appointment?.therapy_modality || modalityId
  const color = appointmentServiceColor(key)
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

export function calendarEventStyleForAppointment(appointment) {
  return calendarEventStyle(appointment?.therapy_modality, appointment)
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
