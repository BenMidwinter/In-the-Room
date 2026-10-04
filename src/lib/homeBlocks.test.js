import { describe, expect, it } from 'vitest'
import { getNextProgressNoteTask } from './homeBlocks'

describe('getNextProgressNoteTask', () => {
  it('picks the oldest incomplete progress-note task', () => {
    const notes = {
      a1: { id: 'n1', status: 'signed_off' },
      a2: { id: 'n2', status: 'draft' },
    }
    const task = getNextProgressNoteTask(
      [
        { id: 'a1', session_date: '2020-01-01', start_time: '09:00', attendance_status: 'attended', block_role: 'client_session' },
        { id: 'a2', session_date: '2020-01-02', start_time: '10:00', attendance_status: 'attended', block_role: 'client_session' },
        { id: 'a3', session_date: '2020-01-03', start_time: '11:00', attendance_status: 'attended', block_role: 'client_session' },
        { id: 'notes', session_date: '2020-01-02', start_time: '10:10', attendance_status: null, block_role: 'admin' },
      ],
      {
        getNote: (id) => notes[id] || null,
        today: '2026-10-03',
      },
    )
    expect(task?.id).toBe('a2')
  })
})
