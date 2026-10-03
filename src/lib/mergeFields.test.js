import { describe, it, expect } from 'vitest'
import { buildMergeContext, MERGE_FIELD_OPTIONS } from './mergeFields'

describe('buildMergeContext', () => {
  it('assembles values from client, appointment and profile', () => {
    const ctx = buildMergeContext({
      client: { real_name: 'Jo Bloggs', dob: '2015-04-01', diagnosis: 'ASD' },
      appointment: { appointment_type: 'one_to_one', location: 'Room 1' },
      profile: { full_name: 'Dr Xu', job_title: 'Music Therapist', hcpc_number: 'AS12345' },
      sessionDate: '2026-06-26',
    })
    expect(ctx.client_name).toBe('Jo Bloggs')
    expect(ctx.service_type).toBe('1:1 session')
    expect(ctx.appointment_location).toBe('Room 1')
    expect(ctx.clinician_name).toBe('Dr Xu')
    expect(ctx.clinician_hcpc).toBe('AS12345')
    expect(ctx.client_diagnosis).toBe('ASD')
    expect(ctx.session_date).toBe('26 Jun 2026')
  })
  it('produces empty strings when sources are missing', () => {
    const ctx = buildMergeContext({})
    expect(ctx.client_name).toBe('')
    expect(ctx.service_type).toBe('')
    expect(ctx.session_date).toBe('')
  })
  it('every merge field option resolves to a defined value', () => {
    const ctx = buildMergeContext({
      client: { real_name: 'A', clinical_profile: {} },
      appointment: null,
      profile: {},
      sessionDate: '',
    })
    for (const opt of MERGE_FIELD_OPTIONS) {
      expect(ctx[opt.key], `missing merge key: ${opt.key}`).toBeDefined()
    }
  })
})
