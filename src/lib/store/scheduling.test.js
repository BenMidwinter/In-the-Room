import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, getUpcomingAppointments } from '../store'
import { db } from '../data/collections'
import { saveAppointment } from './scheduling'

beforeEach(() => {
  resetStore()
})

describe('getUpcomingAppointments', () => {
  it('returns an empty list when the practice has no bookings', () => {
    expect(getUpcomingAppointments('user-1', null)).toEqual([])
    expect(getUpcomingAppointments('user-1', null, { organisationWide: true })).toEqual([])
  })
})

describe('saveAppointment hygiene', () => {
  beforeEach(() => {
    db.orgServices.push(
      {
        id: 'svc-session',
        service_type: 'appointment',
        name: 'Session',
        slug: 'session',
        follow_on_service_id: 'svc-notes',
        follow_on_duration_minutes: 15,
        is_active: true,
      },
      {
        id: 'svc-notes',
        service_type: 'admin',
        name: 'Notes',
        slug: 'notes',
        default_duration_minutes: 10,
        is_active: true,
      },
    )
  })

  it('writes and moves the follow-on with the session, then drops it', () => {
    const saved = saveAppointment({
      client_id: 'c1',
      session_date: '2026-10-10',
      start_time: '09:00',
      end_time: '10:00',
      service_id: 'svc-session',
    }, 'user-1')
    const child = db.appointments.find((row) => row.parent_appointment_id === saved.id)
    expect(child?.block_role).toBe('admin')
    expect(child?.start_time).toBe('10:00')
    expect(child?.end_time).toBe('10:15')

    saveAppointment({
      id: saved.id,
      session_date: '2026-10-10',
      start_time: '11:00',
      end_time: '12:00',
      service_id: 'svc-session',
    }, 'user-1')
    const moved = db.appointments.find((row) => row.parent_appointment_id === saved.id)
    expect(moved?.id).toBe(child?.id)
    expect(moved?.start_time).toBe('12:00')
    expect(moved?.end_time).toBe('12:15')

    db.orgServices[0].follow_on_service_id = null
    saveAppointment({
      id: saved.id,
      session_date: '2026-10-10',
      start_time: '11:00',
      end_time: '12:00',
      service_id: 'svc-session',
    }, 'user-1')
    expect(db.appointments.some((row) => row.parent_appointment_id === saved.id)).toBe(false)
  })

  it('does not store a Google busy block as an appointment', () => {
    expect(() => saveAppointment({
      id: 'ext-abc',
      is_external_busy: true,
      session_date: '2026-10-10',
      start_time: '09:00',
      block_role: 'busy',
    }, 'user-1')).toThrow(/read-only/)
    expect(db.appointments).toHaveLength(0)
  })
})
