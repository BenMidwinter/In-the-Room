import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../supabase/client', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}))
import { resetStore, getProgressNote } from '../store'
import { db } from '../data/collections'
import { saveAppointment, setEpisodeAppointmentsLocal } from '../store/scheduling'
import { deleteLocalEpisode, dischargeLocalEpisode, getLocalEpisode, openLocalEpisode, reopenLocalEpisode } from '../store/episodes'
import { resolveEpisodeAttachment } from './episodes'
import { isProgressNoteEditable } from '../progressNoteLifecycle'
import { saveProgressNoteForUser } from '../supabase/progressNotesRepo'

beforeEach(() => {
  resetStore()
})

describe('resolveEpisodeAttachment', () => {
  it('opens a course only when creating a client session with no active episode', () => {
    expect(resolveEpisodeAttachment({
      blockRole: 'client_session',
      clientId: 'c1',
      isCreate: true,
      activeEpisodeId: null,
    })).toEqual({ episodeId: null, open: true })

    expect(resolveEpisodeAttachment({
      blockRole: 'client_session',
      clientId: 'c1',
      isCreate: true,
      activeEpisodeId: 'ep-1',
    })).toEqual({ episodeId: 'ep-1', open: false })

    expect(resolveEpisodeAttachment({
      blockRole: 'support',
      clientId: 'c1',
      isCreate: true,
      activeEpisodeId: null,
    })).toEqual({ episodeId: null, open: false })

    expect(resolveEpisodeAttachment({
      blockRole: 'support',
      clientId: 'c1',
      isCreate: true,
      activeEpisodeId: 'ep-1',
    })).toEqual({ episodeId: 'ep-1', open: false })

    expect(resolveEpisodeAttachment({
      blockRole: 'admin',
      clientId: 'c1',
      isCreate: true,
      activeEpisodeId: 'ep-1',
    })).toEqual({ episodeId: 'ep-1', open: false })

    expect(resolveEpisodeAttachment({
      blockRole: 'admin',
      clientId: 'c1',
      isCreate: true,
    })).toEqual({ episodeId: null, open: false })

    expect(resolveEpisodeAttachment({
      blockRole: 'busy',
      clientId: null,
      isCreate: true,
    })).toEqual({ episodeId: null, open: false })

    expect(resolveEpisodeAttachment({
      blockRole: 'client_session',
      clientId: 'c1',
      isCreate: false,
      existingEpisodeId: null,
      activeEpisodeId: null,
    })).toEqual({ episodeId: null, open: false })
  })
})

describe('episode courses on bookings', () => {
  const session = {
    client_id: 'c1',
    block_role: 'client_session',
    session_date: '2026-10-10',
    start_time: '09:00',
    end_time: '10:00',
  }

  it('shares one active episode, then opens the next course after discharge', () => {
    const first = saveAppointment(session, 'user-1')
    const second = saveAppointment({ ...session, start_time: '11:00', end_time: '12:00' }, 'user-1')
    expect(first.episode_id).toBeTruthy()
    expect(second.episode_id).toBe(first.episode_id)
    expect(db.episodes.filter((row) => row.status === 'active')).toHaveLength(1)

    dischargeLocalEpisode(String(first.episode_id))
    const returned = saveAppointment({ ...session, session_date: '2028-10-10' }, 'user-1')
    expect(returned.episode_id).not.toBe(first.episode_id)
    expect(getLocalEpisode(String(first.episode_id))?.status).toBe('discharged')
    expect(getLocalEpisode(String(returned.episode_id))?.episode_number).toBe(2)
    expect(getLocalEpisode(String(first.episode_id))?.episode_number).toBe(1)
  })

  it('leaves a legacy booking unattached when it is edited', () => {
    db.appointments.push({
      id: 'appt-legacy',
      client_id: 'c1',
      episode_id: null,
      session_date: '2026-01-01',
      start_time: '09:00',
      end_time: '10:00',
      block_role: 'client_session',
    })
    const saved = saveAppointment({
      id: 'appt-legacy',
      client_id: 'c1',
      session_date: '2026-01-02',
      start_time: '09:00',
      end_time: '10:00',
      block_role: 'client_session',
    }, 'user-1')
    expect(saved.episode_id).toBeNull()
    expect(db.episodes).toHaveLength(0)
  })

  it('does not open a course for admin or busy time', () => {
    const admin = saveAppointment({
      ...session,
      block_role: 'admin',
    }, 'user-1')
    const busy = saveAppointment({
      block_role: 'busy',
      session_date: '2026-10-10',
      start_time: '15:00',
      end_time: '16:00',
    }, 'user-1')
    expect(admin.episode_id).toBeNull()
    expect(busy.episode_id).toBeNull()
    expect(db.episodes).toHaveLength(0)
  })
})

describe('notes follow the appointment', () => {
  it('copies the appointment episode, including after discharge', async () => {
    const booked = saveAppointment({
      client_id: 'c1',
      block_role: 'client_session',
      session_date: '2024-06-01',
      start_time: '09:00',
      end_time: '10:00',
    }, 'user-1')
    dischargeLocalEpisode(String(booked.episode_id))
    const note = await saveProgressNoteForUser({
      client_id: 'c1',
      appointment_id: booked.id,
      episode_id: 'not-this-episode',
      title: 'Late addition',
      content: '<p>Forgot the closing note.</p>',
      session_date: '2024-06-02',
    }, 'user-1')
    expect(note.episode_id).toBe(booked.episode_id)
    expect(getProgressNote(note.id).content).toContain('Forgot the closing note')
    expect(isProgressNoteEditable(note)).toBe(true)
    expect(getLocalEpisode(String(booked.episode_id))?.status).toBe('discharged')
  })

  it('does not open a course for a note, and refuses an appointment with no episode', async () => {
    await expect(saveProgressNoteForUser({
      client_id: 'c1',
      title: 'Loose note',
      content: '<p></p>',
      session_date: '2026-01-01',
    }, 'user-1')).rejects.toThrow(/appointment/)
    expect(db.episodes).toHaveLength(0)

    db.appointments.push({
      id: 'appt-legacy',
      client_id: 'c1',
      episode_id: null,
      session_date: '2026-01-01',
      start_time: '09:00',
      end_time: '10:00',
      block_role: 'client_session',
    })
    await expect(saveProgressNoteForUser({
      client_id: 'c1',
      appointment_id: 'appt-legacy',
      title: 'Waiting',
      content: '<p></p>',
      session_date: '2026-01-01',
    }, 'user-1')).rejects.toThrow(/episode/)
  })
})

describe('assign appointments to an episode', () => {
  it('moves an existing appointment, its follow-on, and its note', async () => {
    const admin = saveAppointment({
      client_id: 'c1',
      block_role: 'admin',
      session_date: '2026-03-01',
      start_time: '09:00',
      end_time: '10:00',
    }, 'user-1')
    db.appointments.push({
      id: 'appt-child',
      client_id: 'c1',
      parent_appointment_id: admin.id,
      episode_id: null,
      block_role: 'admin',
      session_date: '2026-03-01',
      start_time: '10:00',
      end_time: '10:15',
    })
    const note = await saveProgressNoteForUser({
      client_id: 'c1',
      appointment_id: admin.id,
      title: 'Admin note',
      content: '<p>Filed once the appointment has a course.</p>',
      session_date: '2026-03-01',
    }, 'user-1').catch(() => null)
    expect(note).toBeNull()

    const course = openLocalEpisode({ clientId: 'c1', ownerId: 'user-1' })
    const moved = setEpisodeAppointmentsLocal('c1', course.id, [admin.id])
    expect(moved.added).toEqual([admin.id])
    expect(db.appointments.find((row) => row.id === admin.id)?.episode_id).toBe(course.id)
    expect(db.appointments.find((row) => row.id === 'appt-child')?.episode_id).toBe(course.id)

    const filed = await saveProgressNoteForUser({
      client_id: 'c1',
      appointment_id: admin.id,
      title: 'Admin note',
      content: '<p>Filed once the appointment has a course.</p>',
      session_date: '2026-03-01',
    }, 'user-1')
    expect(filed.episode_id).toBe(course.id)

    const cleared = setEpisodeAppointmentsLocal('c1', course.id, [])
    expect(cleared.removed).toEqual([admin.id])
    expect(db.appointments.find((row) => row.id === admin.id)?.episode_id).toBeNull()
    expect(db.appointments.find((row) => row.id === 'appt-child')?.episode_id).toBeNull()
  })
})

describe('reopen a course', () => {
  it('makes the discharged course active again so new appointments join it', () => {
    const first = saveAppointment({
      client_id: 'c1',
      block_role: 'client_session',
      session_date: '2024-01-01',
      start_time: '09:00',
      end_time: '10:00',
    }, 'user-1')
    dischargeLocalEpisode(String(first.episode_id))
    const reopened = reopenLocalEpisode(String(first.episode_id))
    expect(reopened.status).toBe('active')
    expect(reopened.end_date).toBeNull()
    const next = saveAppointment({
      client_id: 'c1',
      block_role: 'client_session',
      session_date: '2026-04-01',
      start_time: '09:00',
      end_time: '10:00',
    }, 'user-1')
    expect(next.episode_id).toBe(first.episode_id)
  })

  it('removes the course and keeps the appointments', async () => {
    const booked = saveAppointment({
      client_id: 'c1',
      block_role: 'client_session',
      session_date: '2026-05-01',
      start_time: '09:00',
      end_time: '10:00',
    }, 'user-1')
    const courseId = String(booked.episode_id)
    db.appointments.push({
      id: 'appt-follow',
      client_id: 'c1',
      parent_appointment_id: booked.id,
      episode_id: courseId,
      block_role: 'client_session',
      session_date: '2026-05-01',
      start_time: '10:00',
      end_time: '10:15',
    })
    const note = await saveProgressNoteForUser({
      client_id: 'c1',
      appointment_id: booked.id,
      title: 'Session',
      content: '<p>Noted.</p>',
      session_date: '2026-05-01',
    }, 'user-1')
    db.reports.push({
      id: 'report-1',
      client_id: 'c1',
      episode_id: courseId,
      title: 'Review',
    })

    const removed = deleteLocalEpisode(courseId)
    expect(removed.id).toBe(courseId)
    expect(getLocalEpisode(courseId)).toBeNull()
    expect(db.appointments.find((row) => row.id === booked.id)?.episode_id).toBeNull()
    expect(db.appointments.find((row) => row.id === 'appt-follow')?.episode_id).toBeNull()
    expect(db.progressNotes.find((row) => row.id === note.id)).toBeUndefined()
    expect(db.reports).toHaveLength(0)
  })

  it('refuses to reopen while another course is open', () => {
    const first = saveAppointment({
      client_id: 'c1',
      block_role: 'client_session',
      session_date: '2024-01-01',
      start_time: '09:00',
      end_time: '10:00',
    }, 'user-1')
    dischargeLocalEpisode(String(first.episode_id))
    openLocalEpisode({ clientId: 'c1', ownerId: 'user-1' })
    expect(() => reopenLocalEpisode(String(first.episode_id))).toThrow(/still open/)
  })
})
