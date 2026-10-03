/**
 * Service Lead overview — aggregate, de-identified data builders.
 * Consumes buildLeadDashboard; presentation lives in features/service-lead/blocks/.
 */

import {
  getAllAppointments,
  getAllProgressNotes,
  getAllMemberships,
  getAllWorkplacesList,
  getOrganisationClients,
} from './store'
import { buildLeadDashboard } from './leadDashboard'
import type { StoreRecord } from './types/collections'
import { ROLES } from './permissions'
import { compareYmd, DEMO_TODAY } from './dateArchitecture'
import { appointmentSchedule } from './appointmentUtils'

function sortSessionGroupsSoonestFirst(groups) {
  return [...groups].sort((a, b) => {
    const dateCmp = compareYmd(a.session_date, b.session_date)
    if (dateCmp !== 0) return dateCmp
    return String(a.workplaceName || '').localeCompare(String(b.workplaceName || ''))
  })
}

function buildUpcomingSessionGroups(appointments, orgClients, workplaces) {
  const clientsById = new Map<string, StoreRecord>(orgClients.map(c => [String(c.id), c as StoreRecord]))
  const wpById = new Map(workplaces.map(w => [w.id, w.name]))
  const groups = new Map()

  for (const appt of appointments) {
    const { session_date } = appointmentSchedule(appt)
    if (compareYmd(session_date, DEMO_TODAY) < 0) continue
    if (appt.attendance_status === 'cancelled') continue

    const client = clientsById.get(appt.client_id)
    if (!client?.workplace_id) continue

    const key = `${session_date}|${client.workplace_id}`
    if (!groups.has(key)) {
      groups.set(key, {
        session_date,
        workplaceId: client.workplace_id,
        workplaceName: wpById.get(client.workplace_id) || client.workplace_name || 'Workplace',
        sessionCount: 0,
        clinicianSet: new Set(),
      })
    }

    const group = groups.get(key)
    group.sessionCount += 1
    if (appt.assigned_therapist) group.clinicianSet.add(appt.assigned_therapist)
  }

  return sortSessionGroupsSoonestFirst(
    [...groups.values()].map(g => ({
      session_date: g.session_date,
      workplaceId: g.workplaceId,
      workplaceName: g.workplaceName,
      sessionCount: g.sessionCount,
      clinicianCount: g.clinicianSet.size,
    })),
  ).slice(0, 10)
}

function buildComplianceExceptions(workplaceRows) {
  return workplaceRows
    .filter(row => row.notesMissing > 0 || row.notesLate > 0 || row.didNotAttend > 0)
    .map(row => ({
      workplaceId: row.id,
      workplaceName: row.name,
      notesMissing: row.notesMissing,
      notesLate: row.notesLate,
      didNotAttend: row.didNotAttend,
    }))
    .sort((a, b) => (
      (b.notesMissing + b.notesLate + b.didNotAttend)
      - (a.notesMissing + a.notesLate + a.didNotAttend)
    ))
}

function buildCaseloadByWorkplace(workplaceRows) {
  return workplaceRows
    .map(row => ({
      workplaceId: row.id,
      workplaceName: row.name,
      activeClients: row.activeClients,
      clinicians: row.clinicians,
    }))
    .sort((a, b) => b.activeClients - a.activeClients || a.workplaceName.localeCompare(b.workplaceName))
}

function buildOutcomeBars(kpis) {
  const attendanceRate = kpis.weekAppointments > 0
    ? Math.round((kpis.attended / kpis.weekAppointments) * 100)
    : 0

  const attendanceLoggedRate = kpis.weekAppointments > 0
    ? Math.round(((kpis.attended + kpis.didNotAttend) / kpis.weekAppointments) * 100)
    : 0

  return [
    { label: 'Notes on time', pct: kpis.noteCompliancePct ?? 0 },
    { label: 'Attendance rate', pct: attendanceRate },
    { label: 'Attendance logged', pct: attendanceLoggedRate },
  ]
}

function buildLeadOrgScope(userId) {
  const orgClients = getOrganisationClients()
  return buildLeadDashboard({
    scope: 'organisation',
    userId,
    demoRole: ROLES.SERVICE_LEAD,
    clients: orgClients,
    allClients: orgClients,
    appointments: getAllAppointments(),
    progressNotes: getAllProgressNotes(),
    workplaces: getAllWorkplacesList(),
    memberships: getAllMemberships(),
    blurNames: true,
  })
}

export function buildOrgPulseData(userId) {
  const dashboard = buildLeadOrgScope(userId)
  return {
    weekLabel: dashboard.weekLabel,
    kpis: dashboard.kpis,
  }
}

export function buildSitePerformanceData(userId) {
  const dashboard = buildLeadOrgScope(userId)
  return {
    weekLabel: dashboard.weekLabel,
    workplaceRows: dashboard.workplaceRows,
  }
}

export function buildComplianceActivityData(userId) {
  const dashboard = buildLeadOrgScope(userId)
  const workplaces = getAllWorkplacesList()
  const orgClients = getOrganisationClients()
  const appointments = getAllAppointments()

  return {
    weekLabel: dashboard.weekLabel,
    outcomeBars: buildOutcomeBars(dashboard.kpis),
    exceptions: buildComplianceExceptions(dashboard.workplaceRows),
    sessionGroups: buildUpcomingSessionGroups(appointments, orgClients, workplaces),
    caseloadByWorkplace: buildCaseloadByWorkplace(dashboard.workplaceRows),
    orgKpis: {
      notesMissing: dashboard.kpis.notesMissing,
      notesLate: dashboard.kpis.notesLate,
      pendingAttendance: dashboard.kpis.pending,
    },
  }
}

export function buildServiceLeadOverview(userId) {
  const pulse = buildOrgPulseData(userId)
  const sitePerformance = buildSitePerformanceData(userId)
  const complianceActivity = buildComplianceActivityData(userId)

  return {
    weekLabel: pulse.weekLabel,
    pulse,
    sitePerformance,
    complianceActivity,
    bannerTotalCount: pulse.kpis.weekAppointments,
  }
}
