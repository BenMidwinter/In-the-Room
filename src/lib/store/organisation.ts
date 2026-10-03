import { db, uid } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { parseOrThrow, clinicianUserInputSchema, orgServiceInputSchema, workplaceInputSchema, workplaceBrandingUpdateSchema, practiceBrandingUpdateSchema, clinicianWorkplaceSettingsSchema } from '../schemas'
import {
  normalizeWorkplaceSettings,
  mergeSettingsForLocations,
  buildClinicianLocations,
  PRIVATE_PRACTICE_LOCATION_ID,
} from '../clinicianAvailability'
import { defaultBrandingFieldsForWorkplace } from '../workplaceBranding'
import {
  canManageWorkplace,
  canManageTeamMembership,
  canViewFullWorkplaceCaseload,
  normalizeRole,
  ROLES,
} from '../permissions'
import { normalizeServiceColor, serviceNameToSlug } from '../serviceColors'

/* ── Workplace context & profiles ─────────────────────────────────────── */

export function getMyWorkplace(userId, workplaceId = null) {
  const userMemberships = db.memberships.filter(m => m.user_id === userId)
  const membership = workplaceId
    ? userMemberships.find(m => m.workplace_id === workplaceId)
    : userMemberships[0]
  if (!membership) return null
  const workplace = db.workplaces.find(w => w.id === membership.workplace_id)
  if (!workplace) return null
  return { id: workplace.id, name: workplace.name, role: membership.role, join_code: workplace.join_code }
}

export function getWorkplaceContextsForUser(userId) {
  return db.memberships
    .filter(m => m.user_id === userId)
    .map(m => {
      const workplace = db.workplaces.find(w => w.id === m.workplace_id)
      if (!workplace) return null
      return {
        id: workplace.id,
        name: workplace.name,
        role: m.role,
        join_code: workplace.join_code,
      }
    })
    .filter(Boolean)
}

export function getProfile(userId) {
  return db.profiles.find(p => p.id === userId) || null
}

export function updateProfile(userId, updates) {
  const idx = db.profiles.findIndex(p => p.id === userId)
  if (idx === -1) {
    db.profiles.push({ id: userId, ...updates })
    return db.profiles[db.profiles.length - 1]
  }
  db.profiles[idx] = { ...db.profiles[idx], ...updates }
  return db.profiles[idx]
}

export function updatePrivatePracticeBranding(userId, payload) {
  const data = parseOrThrow(practiceBrandingUpdateSchema, payload, 'Practice branding')
  return updateProfile(userId, {
    practice_name: data.practice_name?.trim() || '',
    practice_logo_url: data.practice_logo_url?.trim() || null,
    practice_address_line1: data.practice_address_line1,
    practice_address_line2: data.practice_address_line2 || '',
    practice_address_line3: data.practice_address_line3 || '',
    practice_postcode: data.practice_postcode || '',
    practice_country: data.practice_country || '',
  })
}

export function getClinicianWorkplaceSettings(userId) {
  const profile = getProfile(userId)
  return normalizeWorkplaceSettings(profile?.workplace_settings)
}

export function getClinicianLocationsForUser(userId) {
  const memberships = db.memberships
    .filter(m => m.user_id === userId)
    .map(m => {
      const workplace = db.workplaces.find(w => w.id === m.workplace_id)
      return workplace
        ? { workplace_id: workplace.id, name: workplace.name, role: m.role }
        : null
    })
    .filter(Boolean)

  const workplacesById = new Map(db.workplaces.map(w => [w.id, w]))
  return buildClinicianLocations(memberships, workplacesById)
}

export function updateClinicianWorkplaceSettings(userId, settings, locationIds) {
  const merged = mergeSettingsForLocations(
    normalizeWorkplaceSettings(settings),
    locationIds,
  )
  const parsed = parseOrThrow(clinicianWorkplaceSettingsSchema, merged, 'Availability')
  return updateProfile(userId, { workplace_settings: parsed })
}

export function getClinicianSettingAtWorkplace(userId, workplaceId) {
  const settings = getClinicianWorkplaceSettings(userId)
  return settings.find(s => s.workplace_id === workplaceId) || null
}

export function getOrganisationWorkplaceContexts() {
  return db.workplaces.map(wp => ({
    id: wp.id,
    name: wp.name,
    role: 'clinical_lead',
    join_code: wp.join_code,
  }))
}

export function getWorkplacesForUser(userId) {
  return db.memberships
    .filter(m => m.user_id === userId)
    .map(m => {
      const wp = db.workplaces.find(w => w.id === m.workplace_id)
      return wp ? { id: wp.id, name: wp.name } : null
    })
    .filter(Boolean)
}

export function getWorkplaceMembers(workplaceId, myWorkplace) {
  if (!workplaceId || myWorkplace?.id !== workplaceId) return []

  return db.memberships
    .filter(m => m.workplace_id === workplaceId)
    .map(m => {
      const profile = db.profiles.find(p => p.id === m.user_id)
      const caseload = db.clients.filter(c => c.user_id === m.user_id && c.workplace_id === workplaceId)
      return {
        user_id: m.user_id,
        full_name: profile?.full_name || 'Unknown',
        role: m.role,
        caseload_count: caseload.length,
        job_title: profile?.job_title || '',
        hcpc_number: profile?.hcpc_number || '',
      }
    })
}

export function getWorkplaceClinicians(workplaceId) {
  return db.memberships
    .filter(m => {
      if (m.workplace_id !== workplaceId) return false
      const role = normalizeRole(String(m.role))
      return role === ROLES.CLINICAL_LEAD || role === ROLES.CLINICIAN
    })
    .map(m => {
      const profile = db.profiles.find(p => p.id === m.user_id)
      return {
        id: m.user_id,
        full_name: profile?.full_name || 'Unknown',
        role: m.role,
      }
    })
}

export function getAssignedClientsAtWorkplace(userId, workplaceId) {
  return db.clients.filter(c => c.workplace_id === workplaceId && c.user_id === userId)
}

export function getWorkplaceClients(workplaceId, myWorkplace) {
  if (!workplaceId || myWorkplace?.id !== workplaceId) return []
  if (!canViewFullWorkplaceCaseload(myWorkplace)) return []
  return db.clients.filter(c => c.workplace_id === workplaceId)
}

export function getAuditLogs(workplaceId, myWorkplace) {
  if (!canManageWorkplace(myWorkplace) || myWorkplace?.id !== workplaceId) return []
  return db.auditLogs.filter(l => l.workplace_id === workplaceId)
}

/* ── Workplaces ───────────────────────────────────────────────────────── */

export function getAllWorkplaces() {
  return [...db.workplaces].sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export function getAllWorkplacesList() {
  return [...db.workplaces]
}

export function addWorkplace(payload) {
  const data = parseOrThrow(workplaceInputSchema, payload, 'Workplace')
  const trimmed = data.name
  const code = (data.join_code || trimmed.toUpperCase().replace(/\s+/g, '').slice(0, 12))
  const created = {
    id: uid('wp'),
    name: trimmed,
    join_code: code,
    ...defaultBrandingFieldsForWorkplace(trimmed),
  }
  db.workplaces.push(created)
  return created
}

export function getWorkplaceRecord(workplaceId, myWorkplace) {
  if (!workplaceId || myWorkplace?.id !== workplaceId) return null
  if (!canManageWorkplace(myWorkplace)) return null
  return db.workplaces.find(w => w.id === workplaceId) || null
}

export function updateWorkplaceBranding(workplaceId, payload, actorId, myWorkplace) {
  if (!canManageWorkplace(myWorkplace) || myWorkplace?.id !== workplaceId) {
    throw new Error('Only a clinical lead or administrator can update workplace branding.')
  }
  const idx = db.workplaces.findIndex(w => w.id === workplaceId)
  if (idx === -1) throw new Error('Workplace not found.')

  const data = parseOrThrow(workplaceBrandingUpdateSchema, payload, 'Workplace branding')
  const previous = db.workplaces[idx]
  db.workplaces[idx] = {
    ...previous,
    logo_url: data.logo_url?.trim() || null,
    address_line1: data.address_line1,
    address_line2: data.address_line2 || '',
    address_line3: data.address_line3 || '',
    postcode: data.postcode || '',
    country: data.country || '',
  }

  appendAuditLog({
    workplace_id: workplaceId,
    actor_id: actorId,
    action: 'workplace_branding_updated',
    detail: `Updated letterhead branding for ${previous.name}`,
  })

  return db.workplaces[idx]
}

/* ── Membership requests, invites & audit ─────────────────────────────── */

function appendAuditLog({ workplace_id, actor_id, action, detail }) {
  db.auditLogs.push({
    id: uid('log'),
    workplace_id,
    actor_id,
    action,
    detail,
    created_at: new Date().toISOString(),
  })
}

function isWorkplaceMember(userId, workplaceId) {
  return db.memberships.some(m => m.user_id === userId && m.workplace_id === workplaceId)
}

function hasPendingRequest(userId, workplaceId) {
  return db.membershipRequests.some(
    r => r.user_id === userId && r.workplace_id === workplaceId && r.status === 'pending',
  )
}

export function getAllMemberships() {
  return [...db.memberships]
}

export function getAllClinicianProfiles() {
  return [...db.profiles].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
}

export function searchClinicianProfiles(query, { workplaceId = null, excludeUserId = null } = {}) {
  const q = query?.trim().toLowerCase()
  if (!q) return []

  return db.profiles
    .filter(p => {
      if (excludeUserId && p.id === excludeUserId) return false
      if (workplaceId && isWorkplaceMember(p.id, workplaceId)) return false
      const haystack = [p.full_name, p.hcpc_number, p.job_title, p.professional_title, p.bio].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
    .slice(0, 12)
}

export function searchWorkplacesForUser(userId, query) {
  const q = query?.trim().toLowerCase()
  if (!q) return []

  return db.workplaces
    .filter(wp => !isWorkplaceMember(userId, wp.id))
    .filter(wp => String(wp.name).toLowerCase().includes(q) || String(wp.join_code).toLowerCase().includes(q))
    .slice(0, 12)
}

export function getMembershipRequestsForWorkplace(workplaceId, status = 'pending') {
  return db.membershipRequests
    .filter(r => r.workplace_id === workplaceId && (!status || r.status === status))
    .map(r => {
      const profile = db.profiles.find(p => p.id === r.user_id)
      const workplace = db.workplaces.find(w => w.id === r.workplace_id)
      return {
        ...r,
        full_name: profile?.full_name || 'Unknown',
        job_title: profile?.job_title || '',
        hcpc_number: profile?.hcpc_number || '',
        workplace_name: workplace?.name || '',
      } as StoreRecord
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

export function getMyMembershipRequests(userId) {
  return db.membershipRequests
    .filter(r => r.user_id === userId)
    .map(r => {
      const workplace = db.workplaces.find(w => w.id === r.workplace_id)
      return { ...r, workplace_name: workplace?.name || '' } as StoreRecord
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

export function requestWorkplaceMembership(userId, workplaceId, message = '') {
  if (isWorkplaceMember(userId, workplaceId)) {
    throw new Error('You are already a member of this workplace.')
  }
  if (hasPendingRequest(userId, workplaceId)) {
    throw new Error('You already have a pending request for this workplace.')
  }
  const workplace = db.workplaces.find(w => w.id === workplaceId)
  if (!workplace) throw new Error('Workplace not found.')

  const created = {
    id: uid('req'),
    user_id: userId,
    workplace_id: workplaceId,
    requested_role: 'clinician',
    status: 'pending',
    message: message?.trim() || '',
    created_at: new Date().toISOString(),
  }
  db.membershipRequests.push(created)
  return created
}

export function approveMembershipRequest(requestId, actorId, myWorkplace, role = 'clinician') {
  if (!canManageTeamMembership(myWorkplace)) {
    throw new Error('Only a clinical lead or administrator can approve join requests.')
  }
  const idx = db.membershipRequests.findIndex(r => r.id === requestId)
  if (idx === -1) throw new Error('Request not found.')
  const request = db.membershipRequests[idx]
  if (request.status !== 'pending') throw new Error('Request is no longer pending.')
  if (request.workplace_id !== myWorkplace?.id) throw new Error('Request is for a different workplace.')
  if (isWorkplaceMember(request.user_id, request.workplace_id)) {
    db.membershipRequests[idx] = { ...request, status: 'approved', resolved_at: new Date().toISOString(), resolved_by: actorId }
    return db.membershipRequests[idx]
  }

  db.memberships.push({
    id: uid('membership'),
    user_id: request.user_id,
    workplace_id: request.workplace_id,
    role: role || request.requested_role || 'clinician',
  } as StoreRecord)

  const profile = db.profiles.find(p => p.id === request.user_id)
  db.membershipRequests[idx] = {
    ...request,
    status: 'approved',
    resolved_at: new Date().toISOString(),
    resolved_by: actorId,
  }

  appendAuditLog({
    workplace_id: request.workplace_id,
    actor_id: actorId,
    action: 'membership_approved',
    detail: `Approved ${profile?.full_name || 'clinician'} to join the team`,
  })

  return db.membershipRequests[idx]
}

export function declineMembershipRequest(requestId, actorId, myWorkplace) {
  if (!canManageTeamMembership(myWorkplace)) {
    throw new Error('Only a clinical lead or administrator can decline join requests.')
  }
  const idx = db.membershipRequests.findIndex(r => r.id === requestId)
  if (idx === -1) throw new Error('Request not found.')
  const request = db.membershipRequests[idx]
  if (request.status !== 'pending') throw new Error('Request is no longer pending.')
  if (request.workplace_id !== myWorkplace?.id) throw new Error('Request is for a different workplace.')

  const profile = db.profiles.find(p => p.id === request.user_id)
  db.membershipRequests[idx] = {
    ...request,
    status: 'declined',
    resolved_at: new Date().toISOString(),
    resolved_by: actorId,
  }

  appendAuditLog({
    workplace_id: request.workplace_id,
    actor_id: actorId,
    action: 'membership_declined',
    detail: `Declined join request from ${profile?.full_name || 'clinician'}`,
  })

  return db.membershipRequests[idx]
}

export function inviteClinicianToWorkplace(workplaceId, userId, actorId, myWorkplace, role = 'clinician') {
  if (!canManageTeamMembership(myWorkplace) || myWorkplace?.id !== workplaceId) {
    throw new Error('Only a clinical lead or administrator can invite clinicians.')
  }
  if (isWorkplaceMember(userId, workplaceId)) {
    throw new Error('This clinician is already on the team.')
  }
  const profile = db.profiles.find(p => p.id === userId)
  if (!profile) throw new Error('Clinician profile not found.')

  db.memberships.push({
    id: uid('membership'),
    user_id: userId,
    workplace_id: workplaceId,
    role,
  } as StoreRecord)

  const pendingIdx = db.membershipRequests.findIndex(
    r => r.user_id === userId && r.workplace_id === workplaceId && r.status === 'pending',
  )
  if (pendingIdx >= 0) {
    db.membershipRequests[pendingIdx] = {
      ...db.membershipRequests[pendingIdx],
      status: 'approved',
      resolved_at: new Date().toISOString(),
      resolved_by: actorId,
    }
  }

  appendAuditLog({
    workplace_id: workplaceId,
    actor_id: actorId,
    action: 'membership_invited',
    detail: `Invited ${profile.full_name} to join the team`,
  })

  return getWorkplaceMembers(workplaceId, myWorkplace)
}

export function updateWorkplaceMemberRole(workplaceId, memberUserId, newRole, actorId, myWorkplace) {
  if (!canManageTeamMembership(myWorkplace) || myWorkplace?.id !== workplaceId) {
    throw new Error('Only a clinical lead or administrator can change team roles.')
  }
  const role = normalizeRole(newRole)
  if (!([ROLES.CLINICIAN, ROLES.ADMINISTRATOR, ROLES.CLINICAL_LEAD] as readonly string[]).includes(role)) {
    throw new Error('Invalid role.')
  }

  const idx = db.memberships.findIndex(m => m.user_id === memberUserId && m.workplace_id === workplaceId)
  if (idx === -1) throw new Error('Team member not found.')

  const profile = db.profiles.find(p => p.id === memberUserId)
  const previous = db.memberships[idx].role
  db.memberships[idx] = { ...db.memberships[idx], role }

  appendAuditLog({
    workplace_id: workplaceId,
    actor_id: actorId,
    action: 'membership_role_changed',
    detail: `Changed ${profile?.full_name || 'team member'} role from ${previous} to ${role}`,
  })

  return getWorkplaceMembers(workplaceId, myWorkplace)
}

export function getTeamMemberProfile(userId, workplaceId, myWorkplace) {
  if (!workplaceId || myWorkplace?.id !== workplaceId) return null
  if (!isWorkplaceMember(userId, workplaceId)) return null

  const profile = db.profiles.find(p => p.id === userId)
  const membership = db.memberships.find(m => m.user_id === userId && m.workplace_id === workplaceId)
  if (!profile || !membership) return null

  const caseload = db.clients.filter(c => c.user_id === userId && c.workplace_id === workplaceId)
  const otherSites = db.memberships
    .filter(m => m.user_id === userId && m.workplace_id !== workplaceId)
    .map(m => {
      const wp = db.workplaces.find(w => w.id === m.workplace_id)
      return wp ? { id: wp.id, name: wp.name, role: m.role } : null
    })
    .filter(Boolean)

  return {
    ...profile,
    role: membership.role,
    caseload_count: caseload.length,
    active_caseload: caseload.filter(c => c.is_active).length,
    other_workplaces: otherSites,
    photo_url: profile.photo_url || null,
    workplace_setting: getClinicianSettingAtWorkplace(userId, workplaceId),
  }
}

export function addClinicianUser(payload) {
  const data = parseOrThrow(clinicianUserInputSchema, payload, 'Clinician')
  const trimmed = data.full_name

  const created = {
    id: uid('user'),
    full_name: trimmed,
    hcpc_number: data.hcpc_number || '',
    job_title: data.job_title || 'Clinician',
    signature_text: trimmed,
    bio: data.bio?.trim() || '',
  }
  db.profiles.push(created)
  return created
}

export function getWorkplaceMemberCounts(workplaceId) {
  const members = db.memberships.filter(m => m.workplace_id === workplaceId)
  const pending = db.membershipRequests.filter(r => r.workplace_id === workplaceId && r.status === 'pending')
  return { members: members.length, pending: pending.length }
}

/* ── Organisation services ────────────────────────────────────────────── */

export function getAllOrgServices() {
  return [...db.orgServices].sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export function getAppointmentOrgServices() {
  return getAllOrgServices().filter(s => s.service_type === 'appointment' && s.is_active !== false)
}

export function getOrgServiceForModality(modalityId) {
  if (!modalityId) return null
  const key = String(modalityId).trim()
  return db.orgServices.find(s => s.slug === key || s.id === key) || null
}

export function addOrgService(payload) {
  const data = parseOrThrow(orgServiceInputSchema, payload, 'Service')
  const trimmed = data.name
  const type = data.service_type || 'appointment'
  const created = {
    id: uid('svc'),
    service_type: type,
    name: trimmed,
    slug: data.slug?.trim() || serviceNameToSlug(trimmed),
    description: data.description?.trim() || '',
    color: normalizeServiceColor(data.color, type),
    is_active: true,
    created_at: new Date().toISOString(),
  }
  db.orgServices.push(created)
  return created
}
