export const SERVICE_COLOR_PRESETS = [
  '#557a61',
  '#4a7c9e',
  '#8b5a7a',
  '#c17f3e',
  '#6b7280',
  '#374151',
  '#b45309',
  '#0f766e',
] as const

export type ServiceType = 'appointment' | 'admin' | 'busy'

export const DEFAULT_SERVICE_COLORS: Record<ServiceType, string> = {
  appointment: '#557a61',
  admin: '#4a7c9e',
  busy: '#6b7280',
}

export function defaultServiceColor(serviceType: string): string {
  return DEFAULT_SERVICE_COLORS[serviceType as ServiceType] || SERVICE_COLOR_PRESETS[0]
}

export function normalizeServiceColor(color: unknown, serviceType: string = 'appointment'): string {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim())) {
    return color.trim().toLowerCase()
  }
  return defaultServiceColor(serviceType)
}

export function serviceNameToSlug(name: unknown): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}
