import { getAllAppointments, getAllProgressNotes, getAllMemberships } from './store'
import { db } from './data/collections'
import { sortLatestFirst, compareYmd, DEMO_TODAY } from './dateArchitecture'
import { appointmentSchedule } from './appointmentUtils'
import { buildLeadDashboard } from './leadDashboard'
import { ROLES, normalizeRole } from './permissions'
import { getFinanceMockForWorkplace } from './financeMock'

/** Workplaces where the user has team-operations / oversight home blocks. */
export function filterHomeOversightWorkplaces(workplaces: Array<{ role?: string }> = []) {
  return workplaces.filter((wp) => {
    const role = normalizeRole(wp.role)
    return role === ROLES.CLINICAL_LEAD || role === ROLES.ADMINISTRATOR
  })
}

function sortUpcomingSoonestFirst(items) {
  return [...items].sort((a, b) => {
    const dateCmp = String(a.session_date || '').localeCompare(String(b.session_date || ''))
    if (dateCmp !== 0) return dateCmp
    return String(a.start_time || '').localeCompare(String(b.start_time || ''))
  })
}

/** Appointment is on this clinician's diary (matches mock clinician_id + assigned_therapist). */
export function appointmentAssignedToClinician(appt, userId, clinicianName) {
  if (!appt) return false
  if (appt.clinician_id && appt.clinician_id === userId) return true
  if (!clinicianName || !appt.assigned_therapist) return false
  const first = clinicianName.trim().split(/\s+/)[0]
  return appt.assigned_therapist === clinicianName || appt.assigned_therapist === first
}

function clientAtWorkplace(client, workplaceId) {
  if (!workplaceId) return true
  if (!client?.workplace_id) return true
  return client.workplace_id === workplaceId
}

export function getPersonalUpcomingAppointments(userId, clinicianName, workplaceId = null) {
  const today = DEMO_TODAY
  return sortUpcomingSoonestFirst(
    getAllAppointments().filter((appt) => {
      if (!appointmentAssignedToClinician(appt, userId, clinicianName)) return false
      if (appt.attendance_status === 'cancelled') return false
      const { session_date } = appointmentSchedule(appt)
      if (compareYmd(session_date, today) < 0) return false
      const client = db.clients.find(c => c.id === appt.client_id)
      return clientAtWorkplace(client, workplaceId)
    }),
  ).slice(0, 8)
}

export function getPersonalActiveCases(userId, workplaceId = null) {
  return sortLatestFirst(
    db.clients.filter((c) => {
      if (!c.is_active || c.user_id !== userId) return false
      return clientAtWorkplace(c, workplaceId)
    }),
    'created_at',
  ).slice(0, 8)
}

export function getWorkplaceUpcomingAppointments(workplaceId) {
  if (!workplaceId) return []
  const clientIds = new Set(
    db.clients.filter(c => c.workplace_id === workplaceId).map(c => c.id),
  )
  const today = DEMO_TODAY
  return sortUpcomingSoonestFirst(
    getAllAppointments().filter((appt) => {
      if (!clientIds.has(appt.client_id)) return false
      if (appt.attendance_status === 'cancelled') return false
      const { session_date } = appointmentSchedule(appt)
      return compareYmd(session_date, today) >= 0
    }),
  ).slice(0, 10)
}

export function getWorkplaceActiveCases(workplaceId) {
  if (!workplaceId) return []
  return sortLatestFirst(
    db.clients.filter(c => c.workplace_id === workplaceId && c.is_active),
    'created_at',
  ).slice(0, 12)
}

function buildLeadScope({ myWorkplace, clients, demoRole, userId }) {
  return buildLeadDashboard({
    scope: 'workplace',
    workplaceId: myWorkplace?.id,
    userId,
    demoRole,
    clients,
    allClients: clients,
    appointments: getAllAppointments(),
    progressNotes: getAllProgressNotes(),
    workplaces: myWorkplace ? [{ id: myWorkplace.id, name: myWorkplace.name }] : [],
    memberships: getAllMemberships(),
    blurNames: false,
  })
}

export function buildClinicianBlockData({ session, persona }) {
  const clientsById = new Map(db.clients.map(c => [c.id, c]))
  const upcoming = getPersonalUpcomingAppointments(
    session.user.id,
    persona.name,
    null,
  ).map(appt => ({
    ...appt,
    client_name: clientsById.get(appt.client_id)?.real_name,
  }))
  const activeCases = getPersonalActiveCases(session.user.id, null)
  const todayCount = upcoming.filter(a => a.session_date === DEMO_TODAY).length

  return { upcoming, activeCases, todayCount }
}

export function buildAdministratorBlockData({ session, workplace }) {
  if (!workplace?.id) {
    return { weekLabel: '', attendance: null, upcoming: [], activeCases: [], workplaceName: '' }
  }

  const dashboard = buildLeadScope({
    myWorkplace: workplace,
    clients: db.clients.filter(c => c.workplace_id === workplace.id),
    demoRole: ROLES.ADMINISTRATOR,
    userId: session.user.id,
  })

  const clientsById = new Map(db.clients.map(c => [c.id, c]))
  const upcoming = getWorkplaceUpcomingAppointments(workplace.id).map(appt => {
    const client = clientsById.get(appt.client_id)
    return {
      ...appt,
      client_name: client?.real_name,
      assigned_therapist: appt.assigned_therapist || client?.assigned_therapist,
    }
  })

  const activeCases = getWorkplaceActiveCases(workplace.id).map(client => ({
    ...client,
    lead_clinician: client.assigned_therapist,
  }))

  return {
    weekLabel: dashboard.weekLabel,
    workplaceName: workplace.name,
    attendance: {
      total: dashboard.kpis.weekAppointments,
      attended: dashboard.kpis.attended,
      didNotAttend: dashboard.kpis.didNotAttend,
      pending: dashboard.kpis.pending,
    },
    upcoming,
    activeCases,
  }
}

/** Mock admin finance surfaces — not wired to Xero. */
export function buildAdminFinanceBlockData({ workplace }) {
  return getFinanceMockForWorkplace(workplace)
}

export function buildClinicalLeadBlockData({ session, workplace, demoRole }) {
  if (!workplace?.id) {
    return { weekLabel: '', kpis: null, clientRows: [], outcomeBars: [], workplaceName: '' }
  }

  const clients = db.clients.filter(c => c.workplace_id === workplace.id)
  const dashboard = buildLeadScope({ myWorkplace: workplace, clients, demoRole, userId: session.user.id })
  const { kpis } = dashboard

  const attendanceRate = kpis.weekAppointments > 0
    ? Math.round((kpis.attended / kpis.weekAppointments) * 100)
    : null

  const attendanceLoggedRate = kpis.weekAppointments > 0
    ? Math.round(((kpis.attended + kpis.didNotAttend) / kpis.weekAppointments) * 100)
    : null

  const outcomeBars = [
    { label: 'Notes on time', pct: kpis.noteCompliancePct ?? 0 },
    { label: 'Attendance rate', pct: attendanceRate ?? 0 },
    { label: 'Attendance logged', pct: attendanceLoggedRate ?? 0 },
  ]

  return {
    weekLabel: dashboard.weekLabel,
    workplaceName: workplace.name,
    kpis,
    clientRows: dashboard.clientRows,
    outcomeBars,
  }
}
