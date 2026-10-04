import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, saveProgressNote, getProgressNote } from '../store'
import { db } from '../data/collections'
import { saveAppointment } from '../store/scheduling'
import { dischargeLocalEpisode, getLocalEpisode } from '../store/episodes'
import { episodeForNote, resolveEpisodeAttachment } from './episodes'
import { isProgressNoteEditable } from '../progressNoteLifecycle'

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

describe('notes on a discharged episode', () => {
  it('keeps a requested discharged episode and leaves the note editable', () => {
    expect(episodeForNote({
      requestedEpisodeId: 'ep-closed',
      appointmentEpisodeId: 'ep-appt',
      activeEpisodeId: 'ep-open',
    })).toEqual({ episodeId: 'ep-closed', open: false })

    const episodeId = 'ep-closed'
    db.episodes.push({
      id: episodeId,
      client_id: 'c1',
      episode_number: 1,
      status: 'discharged',
      start_date: '2024-01-01',
      end_date: '2024-06-01',
    })
    const note = saveProgressNote({
      client_id: 'c1',
      episode_id: episodeId,
      title: 'Late addition',
      content: '<p>Forgot the closing note.</p>',
      session_date: '2024-06-02',
    }, 'user-1')
    dischargeLocalEpisode(episodeId)
    const stored = getProgressNote(note.id)
    expect(stored.episode_id).toBe(episodeId)
    expect(stored.content).toContain('Forgot the closing note')
    expect(isProgressNoteEditable(stored)).toBe(true)
    expect(getLocalEpisode(episodeId)?.status).toBe('discharged')
  })
})
