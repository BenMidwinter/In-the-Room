import { describe, expect, it } from 'vitest'
import {
  clinicianUserInputSchema,
  orgServiceInputSchema,
  orgTemplateInputSchema,
  parseOrThrow,
  workplaceInputSchema,
  workplaceBrandingUpdateSchema,
} from './schemas'

describe('org mutation schemas', () => {
  it('requires workplace name', () => {
    expect(() => parseOrThrow(workplaceInputSchema, { name: '  ' }, 'Workplace')).toThrow(/Workplace name/)
    const parsed = parseOrThrow(workplaceInputSchema, { name: 'North Hub' }, 'Workplace')
    expect(parsed.name).toBe('North Hub')
  })

  it('requires clinician full name', () => {
    expect(() => parseOrThrow(clinicianUserInputSchema, { full_name: '' }, 'Clinician')).toThrow(/Full name/)
    const parsed = parseOrThrow(clinicianUserInputSchema, {
      full_name: 'Sam Rivera',
      job_title: 'Music Therapist',
    }, 'Clinician')
    expect(parsed.full_name).toBe('Sam Rivera')
  })

  it('requires service name and allows service type', () => {
    expect(() => parseOrThrow(orgServiceInputSchema, { name: '' }, 'Service')).toThrow(/Service name/)
    const parsed = parseOrThrow(orgServiceInputSchema, {
      service_type: 'admin',
      name: 'Notetaking',
    }, 'Service')
    expect(parsed.service_type).toBe('admin')
  })

  it('requires template name on save', () => {
    expect(() => parseOrThrow(orgTemplateInputSchema, { name: '   ' }, 'Template')).toThrow(/Template name/)
    const parsed = parseOrThrow(orgTemplateInputSchema, {
      id: 'pnt-1',
      name: 'Session note',
      content: '<p></p>',
    }, 'Template')
    expect(parsed.name).toBe('Session note')
  })

  it('requires address line 1 for workplace branding', () => {
    expect(() => parseOrThrow(workplaceBrandingUpdateSchema, { address_line1: '' }, 'Workplace branding'))
      .toThrow(/Address line 1/)
  })
})
