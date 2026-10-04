import { filterAppointmentsForPersona } from './calendarAccess'

export function getCalendarOwnerOptions(persona) {
  if (!persona?.userId) return []
  return [{
    value: persona.userId,
    label: `${persona.name || 'You'} (you)`,
    solo: true,
  }]
}

export function getDefaultCalendarOwner(persona) {
  return persona?.userId || ''
}

export function canPickCalendarOwner() {
  return false
}

export function filterAppointmentsByCalendarOwner(appointments, _ownerValue, persona) {
  return filterAppointmentsForPersona(appointments, persona)
}

export function getCalendarOwnerLabel(options, ownerValue) {
  return options.find(o => o.value === ownerValue)?.label || 'Calendar'
}
