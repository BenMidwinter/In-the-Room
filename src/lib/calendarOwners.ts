import { DEMO_PERSONAS } from '../lib/demoPersonas'
import { ROLES } from './permissions'
import { getWorkplaceClinicians } from './store'
import { filterAppointmentsForPersona } from './calendarAccess'

export const CALENDAR_OWNER_ALL = 'all'
export const CALENDAR_OWNER_ALL_TEAM = 'team_all'

export function getCalendarOwnerOptions(persona, myWorkplace) {
  if (!persona) return []

  if (persona.role === ROLES.CLINICIAN) {
    return [{
      value: persona.userId,
      label: `${persona.name} (you)`,
      solo: true,
    }]
  }

  if (persona.role === ROLES.SERVICE_LEAD) {
    return [
      { value: CALENDAR_OWNER_ALL, label: 'All organisation' },
      ...DEMO_PERSONAS
        .filter(p => p.role !== ROLES.SERVICE_LEAD)
        .map(p => ({ value: p.userId, label: `${p.name} — ${p.label}` })),
    ]
  }

  const team = myWorkplace ? getWorkplaceClinicians(myWorkplace.id) : []
  const options = [{ value: CALENDAR_OWNER_ALL_TEAM, label: 'All team' }]

  for (const member of team) {
    const match = DEMO_PERSONAS.find(p => p.userId === member.id)
    options.push({
      value: String(member.id),
      label: match ? `${match.name} — ${match.label}` : String(member.full_name || 'Unknown'),
    })
  }

  return options
}

export function getDefaultCalendarOwner(persona) {
  if (persona.role === ROLES.CLINICIAN) return persona.userId
  if (persona.role === ROLES.SERVICE_LEAD) return CALENDAR_OWNER_ALL
  return CALENDAR_OWNER_ALL_TEAM
}

export function canPickCalendarOwner(persona) {
  return persona.role !== ROLES.CLINICIAN
}

export function filterAppointmentsByCalendarOwner(appointments, ownerValue, persona) {
  const base = filterAppointmentsForPersona(appointments, persona)

  if (persona.role === ROLES.CLINICIAN) return base
  if (ownerValue === CALENDAR_OWNER_ALL || ownerValue === CALENDAR_OWNER_ALL_TEAM) return base

  const therapist = DEMO_PERSONAS.find(p => p.userId === ownerValue)
  return base.filter(a =>
    a.clinician_id === ownerValue || a.assigned_therapist === therapist?.name,
  )
}

export function getCalendarOwnerLabel(options, ownerValue) {
  return options.find(o => o.value === ownerValue)?.label || 'Calendar'
}
