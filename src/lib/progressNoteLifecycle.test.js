import { describe, it, expect, beforeEach } from 'vitest'
import { resetStore, saveProgressNote, signOffProgressNote, getProgressNote } from './store'
import { db } from './data/collections'
import {
  enrichProgressNoteLock,
  isProgressNoteEditable,
  lockUntilFromSignOff,
  progressNoteHistoryStatusLabel,
  PROGRESS_NOTE_LOCK_HOURS,
} from './progressNoteLifecycle'

describe('progressNoteLifecycle', () => {
  beforeEach(() => {
    resetStore()
  })

  it('new notes default to draft and are editable', () => {
    const note = saveProgressNote({
      client_id: 'client-1',
      title: 'Test note',
      content: '<p>Hello</p>',
      session_date: '2026-07-03',
    }, 'user-sarah')

    expect(note.status).toBe('draft')
    expect(note.is_locked).toBe(false)
    expect(isProgressNoteEditable(note)).toBe(true)
  })

  it('sign-off starts a 48-hour amendment window then locks', () => {
    const draft = saveProgressNote({
      client_id: 'client-1',
      title: 'Sign-off test',
      content: '<p>Body</p>',
      session_date: '2026-07-03',
    }, 'user-sarah')

    const signed = signOffProgressNote({
      id: draft.id,
      client_id: 'client-1',
      title: draft.title,
      content: draft.content,
      session_date: draft.session_date,
    }, 'user-sarah')

    expect(signed.status).toBe('signed_off')
    expect(signed.signed_off_at).toBeTruthy()
    expect(signed.lock_until).toBeTruthy()
    expect(isProgressNoteEditable(signed)).toBe(true)

    const locked = enrichProgressNoteLock({
      ...signed,
      lock_until: new Date(Date.now() - 1000).toISOString(),
    })
    expect(locked.is_locked).toBe(true)
    expect(isProgressNoteEditable(locked)).toBe(false)
  })

  it('locked notes cannot be saved', () => {
    const draft = saveProgressNote({
      client_id: 'client-1',
      title: 'Locked note',
      content: '<p>Body</p>',
      session_date: '2026-07-03',
    }, 'user-sarah')

    const signed = signOffProgressNote({
      id: draft.id,
      client_id: 'client-1',
      title: draft.title,
      content: draft.content,
      session_date: draft.session_date,
    }, 'user-sarah')

    const idx = db.progressNotes.findIndex(n => n.id === signed.id)
    db.progressNotes[idx].lock_until = new Date(Date.now() - 60_000).toISOString()

    expect(() => saveProgressNote({
      id: signed.id,
      client_id: 'client-1',
      title: 'Changed',
      content: '<p>Changed</p>',
      session_date: draft.session_date,
    }, 'user-sarah')).toThrow(/locked/)
  })

  it(`lock deadline is ${PROGRESS_NOTE_LOCK_HOURS} hours after sign-off`, () => {
    const signedAt = new Date('2026-07-03T10:00:00Z')
    const until = new Date(lockUntilFromSignOff(signedAt))
    const hours = (until.getTime() - signedAt.getTime()) / (60 * 60 * 1000)
    expect(hours).toBe(PROGRESS_NOTE_LOCK_HOURS)
  })

  it('maps lifecycle status to notes history labels', () => {
    expect(progressNoteHistoryStatusLabel({ status: 'draft' })).toBe('DRAFT')
    expect(progressNoteHistoryStatusLabel({ status: 'signed_off' })).toBe('COMPLETE')
    expect(progressNoteHistoryStatusLabel(null)).toBe('DRAFT')
  })
})
