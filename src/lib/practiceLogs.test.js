import { describe, expect, it } from 'vitest'
import { hoursFromMinutes, logContentFromPayload, normalizePracticeLogInput } from './practiceLogs'

describe('practice logs', () => {
  it('turns hours into minutes and reads the note from the payload', () => {
    expect(hoursFromMinutes(90)).toBe(1.5)
    expect(logContentFromPayload({ v: 0, content: '<p>Reflected.</p>' })).toBe('<p>Reflected.</p>')
    expect(logContentFromPayload(null)).toBe('<p></p>')
  })

  it('keeps supervision delivered and received on one record', () => {
    const received = normalizePracticeLogInput('supervision', {
      occurredOn: '2026-04-02',
      hours: '1.5',
      label: 'Peer group',
      direction: 'received',
      content: '<p>Brought a stuck case.</p>',
    })
    expect(received.minutes).toBe(90)
    expect(received.direction).toBe('received')
    expect(received.label).toBe('Peer group')

    const delivered = normalizePracticeLogInput('supervision', {
      occurredOn: '2026-04-03',
      hours: 1,
      direction: 'delivered',
    })
    expect(delivered.direction).toBe('delivered')
    expect(delivered.label).toBe('Supervision')
    expect(delivered.content).toBe('<p></p>')
  })

  it('does not ask CPD for a supervision direction', () => {
    const entry = normalizePracticeLogInput('cpd', {
      occurredOn: '2026-05-01',
      hours: 6,
      label: 'Trauma conference',
      direction: 'received',
    })
    expect(entry.direction).toBeNull()
    expect(entry.minutes).toBe(360)
  })

  it('rejects a missing date, a bad hour count, and an unknown supervision type', () => {
    expect(() => normalizePracticeLogInput('cpd', { hours: 1, label: 'Reading' })).toThrow(/date/i)
    expect(() => normalizePracticeLogInput('cpd', { occurredOn: '2026-05-01', hours: -1 })).toThrow(/hours/i)
    expect(() => normalizePracticeLogInput('supervision', {
      occurredOn: '2026-05-01',
      hours: 1,
      direction: 'both',
    })).toThrow(/delivered or received/i)
  })
})
