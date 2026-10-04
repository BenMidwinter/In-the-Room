import { describe, it, expect } from 'vitest'
import {
  buildMergeContext,
  MERGE_FIELD_OPTIONS,
  fillMergeFields,
  mergeFieldDisplay,
  signatureRegistrationLine,
} from './mergeFields'

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
    expect(ctx.clinician_title).toBe('Music Therapist')
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

  it('reads the account profile, not the old clinical profile fields', () => {
    const ctx = buildMergeContext({
      profile: {
        display_name: 'Ada North',
        professional_title: 'Dramatherapist',
        registration_numbers: [{ body: 'HCPC', number: 'AS12345' }],
      },
    })
    expect(ctx.clinician_name).toBe('Ada North')
    expect(ctx.clinician_title).toBe('Dramatherapist')
    expect(ctx.clinician_hcpc).toBe('HCPC AS12345')
    expect(signatureRegistrationLine(ctx.clinician_hcpc)).toBe('HCPC AS12345')
    expect(signatureRegistrationLine('AS12345')).toBe('HCPC AS12345')
    expect(signatureRegistrationLine('BACP 12345')).toBe('BACP 12345')
    expect(signatureRegistrationLine('HCPC AS12345, BACP 123')).toBe('HCPC AS12345, BACP 123')
    const keys = MERGE_FIELD_OPTIONS.map((option) => option.key)
    expect(keys).not.toContain('recurring_themes')
    expect(keys).not.toContain('sensory_considerations')
    expect(keys).not.toContain('working_formulation')
    expect(keys).not.toContain('clinical_goals')
    expect(keys).not.toContain('preferred_modalities')
  })

  it('keeps labels in a template and fills them in a note', () => {
    const html = '<p>Hello <span data-merge-field="clinician_name" class="merge-field">Clinician name</span></p>'
    expect(mergeFieldDisplay('clinician_name', { clinician_name: 'Ada North' }, 'template')).toBe('{Clinician name}')
    expect(fillMergeFields(html, { clinician_name: 'Ada North' }, 'document')).toContain('Ada North')
    expect(fillMergeFields(html, { clinician_name: 'Ada North' }, 'template')).toContain('{Clinician name}')
  })
})
