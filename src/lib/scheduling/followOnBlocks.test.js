import { describe, expect, it } from 'vitest'
import { planAppointmentBlocks } from './followOnBlocks'

describe('planAppointmentBlocks', () => {
  it('labels the follow-on with the follow-on service role', () => {
    const blocks = planAppointmentBlocks(
      {
        id: 'svc-session',
        service_type: 'appointment',
        default_duration_minutes: 50,
        follow_on_service_id: 'svc-admin',
        follow_on_duration_minutes: 10,
      },
      new Date('2026-10-10T09:00:00'),
      {
        id: 'svc-admin',
        service_type: 'admin',
        default_duration_minutes: 10,
      },
    )
    expect(blocks.map((block) => block.blockRole)).toEqual(['client_session', 'admin'])
    expect(blocks[1].serviceId).toBe('svc-admin')
  })
})
