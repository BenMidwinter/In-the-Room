/**
 * Lead dashboard analytics — organisation (Service Lead) and workplace (Clinical Lead).
 * All dates use strict YYYY-MM-DD; week = Mon–Fri anchored on DEMO_TODAY.
 */

import {
  DEMO_TODAY,
  workingWeekDatesYmd,
  compareYmd,
  compareTime,
  formatDisplayDate,
  sortLatestFirst,
  daysBetweenYmd,
} from './dateArchitecture'
import { appointmentSchedule } from './appointmentUtils'
import { ROLES, normalizeRole } from './permissions'
import type { StoreRecord } from './types/collections'

function weekLabel(weekDates) {
  if (!weekDates.length) return ''
  const first = formatDisplayDate(weekDates[0])
  const last = formatDisplayDate(weekDates[weekDates.length - 1])
  return `${first} – ${last}`
}

function isInWeek(sessionDate, weekDates) {
  return weekDates.includes(sessionDate)
}

function findNoteForAppointment(appt, progressNotes) {
  const { session_date } = appointmentSchedule(appt)
  return progressNotes.find(n => n.appointment_id === appt.id)
    || progressNotes.find(n => n.client_id === appt.client_id && n.session_date === session_date)
}

function noteComplianceForAppointment(appt, progressNotes, onTimeDays = 2) {
  if (appt.attendance_status !== 'attended') return null

  const note = findNoteForAppointment(appt, progressNotes)
  if (!note) return 'missing'

  const sessionDate = appointmentSchedule(appt).session_date
  const noteDate = (note.created_at || note.session_date || '').split('T')[0]
  const delta = daysBetweenYmd(sessionDate, noteDate)

  if (delta <= onTimeDays) return 'on_time'
  return 'late'
}

export function computeAttendanceSummary(weekAppointments) {
  const attended = weekAppointments.filter(a => a.attendance_status === 'attended').length
  const didNotAttend = weekAppointments.filter(a => a.attendance_status === 'did_not_attend').length
  const cancelled = weekAppointments.filter(a => a.attendance_status === 'cancelled').length
  const pending = weekAppointments.filter(a => !a.attendance_status).length

  return {
    total: weekAppointments.length,
    attended,
    didNotAttend,
    cancelled,
    pending,
  }
}

export function computeNoteCompliance(weekAppointments, progressNotes) {
  const attendedAppts = weekAppointments.filter(a => a.attendance_status === 'attended')
  let onTime = 0
  let late = 0
  let missing = 0

  for (const appt of attendedAppts) {
    const status = noteComplianceForAppointment(appt, progressNotes)
    if (status === 'on_time') onTime += 1
    else if (status === 'late') late += 1
    else missing += 1
  }

  const total = attendedAppts.length
  const compliancePct = total > 0 ? Math.round((onTime / total) * 100) : null

  return { onTime, late, missing, total, compliancePct }
}

function sortAppointmentsSoonestFirst(items) {
  return [...items].sort((a, b) => {
    const dateCmp = compareYmd(appointmentSchedule(a).session_date, appointmentSchedule(b).session_date)
    if (dateCmp !== 0) return dateCmp
    return compareTime(appointmentSchedule(a).start_time, appointmentSchedule(b).start_time)
  })
}

function filterScopeClients(clients, { scope, workplaceId, userId, demoRole }) {
  if (scope === 'organisation') {
    return clients.filter(c => c.workplace_id && c.is_active)
  }

  const wpClients = clients.filter(c => c.workplace_id === workplaceId && c.is_active)
  if (demoRole === ROLES.CLINICIAN) {
    return wpClients.filter(c => c.user_id === userId)
  }
  return wpClients
}

function filterScopeAppointments(allAppointments, scopeClients, weekDates) {
  const clientIds = new Set(scopeClients.map(c => c.id))
  return allAppointments.filter(a => {
    const { session_date } = appointmentSchedule(a)
    return clientIds.has(a.client_id) && isInWeek(session_date, weekDates)
  })
}

function buildClientWeekRows(scopeClients, weekAppointments, progressNotes) {
  return scopeClients.map(client => {
    const clientAppts = weekAppointments.filter(a => a.client_id === client.id)
    const attendance = computeAttendanceSummary(clientAppts)
    const notes = computeNoteCompliance(clientAppts, progressNotes)

    return {
      clientId: client.id,
      clientName: client.real_name,
      workplaceId: client.workplace_id,
      workplaceName: client.workplace_name || '—',
      ...attendance,
      notesOnTime: notes.onTime,
      notesMissing: notes.missing,
      notesLate: notes.late,
    }
  }).filter(row => row.total > 0)
    .sort((a, b) => b.total - a.total || a.clientName.localeCompare(b.clientName))
}

function buildWorkplaceRows(workplaces, allClients, weekAppointments, progressNotes, memberships) {
  return workplaces.map(wp => {
    const wpClients = allClients.filter(c => c.workplace_id === wp.id && c.is_active)
    const clientIds = new Set(wpClients.map(c => c.id))
    const wpAppts = weekAppointments.filter(a => clientIds.has(a.client_id))
    const attendance = computeAttendanceSummary(wpAppts)
    const notes = computeNoteCompliance(wpAppts, progressNotes)
    const clinicians = memberships.filter(m => {
      if (m.workplace_id !== wp.id) return false
      const role = normalizeRole(m.role)
      return role === ROLES.CLINICAL_LEAD || role === ROLES.CLINICIAN || role === ROLES.ADMINISTRATOR
    }).length

    return {
      id: wp.id,
      name: wp.name,
      activeClients: wpClients.length,
      clinicians,
      ...attendance,
      notesOnTime: notes.onTime,
      notesMissing: notes.missing,
      notesLate: notes.late,
      noteCompliancePct: notes.compliancePct,
    }
  })
}

/**
 * @param {object} params
 * @param {'organisation'|'workplace'} params.scope
 * @param {string} [params.workplaceId]
 * @param {string} params.userId
 * @param {string} params.demoRole
 * @param {Array} params.clients — visible clients for user
 * @param {Array} params.allClients — full org client list (organisation scope)
 * @param {Array} params.appointments
 * @param {Array} params.progressNotes
 * @param {Array} params.workplaces
 * @param {Array} params.memberships
 * @param {boolean} params.blurNames
 */
export function buildLeadDashboard({
  scope,
  workplaceId = null,
  userId,
  demoRole,
  clients,
  allClients,
  appointments,
  progressNotes,
  workplaces,
  memberships,
  blurNames: _blurNames = false,
}) {
  void _blurNames
  const weekDates = workingWeekDatesYmd(DEMO_TODAY)
  const orgClients = allClients || clients
  const scopeClients = filterScopeClients(orgClients, { scope, workplaceId, userId, demoRole })
  const weekAppointments = filterScopeAppointments(appointments, scopeClients, weekDates)
  const attendance = computeAttendanceSummary(weekAppointments)
  const notes = computeNoteCompliance(weekAppointments, progressNotes)

  const clientRows = buildClientWeekRows(scopeClients, weekAppointments, progressNotes)
    .filter(row => row.total > 0)

  const clinicianIds = new Set(
    memberships
      .filter(m => {
        const role = normalizeRole(m.role)
        return role === ROLES.CLINICAL_LEAD || role === ROLES.CLINICIAN
      })
      .map(m => m.user_id),
  )

  const clientsById = new Map<string, StoreRecord>(orgClients.map(c => [String(c.id), c as StoreRecord]))

  const upcoming = sortAppointmentsSoonestFirst(
    appointments.filter(a => {
      const { session_date } = appointmentSchedule(a)
      if (compareYmd(session_date, DEMO_TODAY) < 0) return false
      if (a.attendance_status === 'cancelled') return false
      const client = clientsById.get(a.client_id)
      if (!client) return false
      if (scope === 'organisation') {
        return !!client.workplace_id && scopeClients.some(c => c.id === a.client_id)
      }
      if (client.workplace_id !== workplaceId) return false
      if (demoRole === ROLES.CLINICIAN && client.user_id !== userId) return false
      return true
    }),
  ).slice(0, 10)

  const activeCases = sortLatestFirst(
    scopeClients.filter(c => c.is_active),
    'created_at',
  ).slice(0, 8)

  const workplaceRows = scope === 'organisation'
    ? buildWorkplaceRows(workplaces, orgClients, weekAppointments, progressNotes, memberships)
    : []

  return {
    weekLabel: weekLabel(weekDates),
    weekDates,
    kpis: {
      workplaces: workplaces.length,
      clinicians: clinicianIds.size,
      activeClients: scopeClients.filter(c => c.is_active).length,
      weekAppointments: attendance.total,
      ...attendance,
      notesOnTime: notes.onTime,
      notesLate: notes.late,
      notesMissing: notes.missing,
      noteCompliancePct: notes.compliancePct,
    },
    workplaceRows,
    clientRows,
    upcoming,
    activeCases,
  }
}
