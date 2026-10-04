import { describe, expect, it } from 'vitest'
import {
  assertWritableAppointment,
  blockRoleForServiceType,
  followOnBlockRole,
  planFollowOnBlock,
  planFollowOnWrite,
} from './appointmentHygiene'

const session = {
  id: 'svc-session',
  service_type: 'appointment',
  name: 'Session',
  slug: 'session',
  follow_on_service_id: 'svc-notes',
  follow_on_duration_minutes: 15,
}

const notes = {
  id: 'svc-notes',
  service_type: 'admin',
  name: 'Notes',
  slug: 'notes',
  default_duration_minutes: 10,
  is_active: true,
}

describe('appointment hygiene', () => {
  it('maps service types onto block roles', () => {
    expect(blockRoleForServiceType('appointment')).toBe('client_session')
    expect(blockRoleForServiceType('support')).toBe('support')
    expect(blockRoleForServiceType('admin')).toBe('admin')
    expect(blockRoleForServiceType('busy')).toBe('busy')
    expect(followOnBlockRole('appointment')).toBe('support')
    expect(followOnBlockRole('busy')).toBe('busy')
  })

  it('plans a follow-on from the linked service type', () => {
    expect(planFollowOnBlock(session, notes)).toMatchObject({
      serviceId: 'svc-notes',
      blockRole: 'admin',
      durationMinutes: 15,
    })
    expect(planFollowOnBlock({ ...session, follow_on_service_id: null }, notes)).toBeNull()
    expect(planFollowOnBlock(session, { ...notes, is_active: false })).toBeNull()
  })

  it('replaces, inserts, or drops the follow-on child', () => {
    const plan = planFollowOnBlock(session, notes)
    expect(planFollowOnWrite([], plan)).toMatchObject({ insert: true, keepId: null, deleteIds: [] })
    expect(planFollowOnWrite(['child-1', 'child-2'], plan)).toMatchObject({
      insert: false,
      keepId: 'child-1',
      deleteIds: ['child-2'],
    })
    expect(planFollowOnWrite(['child-1'], null)).toEqual({
      keepId: null,
      deleteIds: ['child-1'],
      insert: false,
      plan: null,
    })
  })

  it('refuses to write Google busy rows as appointments', () => {
    expect(() => assertWritableAppointment({ id: 'ext-1', is_external_busy: true })).toThrow(/read-only/)
    expect(() => assertWritableAppointment({ id: 'ext-abc' })).toThrow(/read-only/)
    expect(() => assertWritableAppointment({ id: 'appt-1' })).not.toThrow()
  })
})
