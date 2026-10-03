import { z, type ZodType } from 'zod'
import { APPOINTMENT_TYPES, ATTENDANCE_STATUSES } from './mockData'

/**
 * Validation boundary for everything that writes into the store. Today the store
 * is an in-memory mock; when it becomes a real API these same schemas guard the
 * network seam. Keep schemas permissive on optional fields (the store applies its
 * own defaults) but strict on the identifiers and required inputs a write needs.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/

const appointmentTypeKeys = Object.keys(APPOINTMENT_TYPES) as [string, ...string[]]
const attendanceStatusKeys = Object.keys(ATTENDANCE_STATUSES) as [string, ...string[]]

const requiredText = (label: string) =>
  z.string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)

const optionalText = z.string().trim().optional()
const dateString = z.string().regex(YMD, 'Date must be YYYY-MM-DD.')
const timeString = z.string().regex(HHMM, 'Time must be HH:mm.')

export const clientInputSchema = z.object({
  id: z.string().optional(),
  first_name: requiredText('First name'),
  surname: requiredText('Surname'),
  dob: z.string({ error: 'Date of birth is required.' }).regex(YMD, 'Date of birth must be YYYY-MM-DD.'),
  school: optionalText,
  diagnosis: optionalText,
  medication: optionalText,
  workplace_id: z.string().nullish(),
})

export const progressNoteInputSchema = z
  .object({
    id: z.string().optional(),
    client_id: z.string().optional(),
    appointment_id: z.string().nullish(),
    title: optionalText,
    content: z.string().optional(),
    session_date: dateString.optional(),
    modality_used: z.string().nullish(),
    therapeutic_theme: optionalText,
    artwork_attachments: z.array(z.unknown()).optional(),
    status: z.enum(['draft', 'signed_off']).optional(),
  })
  .refine((p) => Boolean(p.id || p.client_id), {
    message: 'A client is required to create a progress note.',
    path: ['client_id'],
  })

export const workingDocumentInputSchema = z
  .object({
    id: z.string().optional(),
    client_id: z.string().optional(),
    title: optionalText,
    content: z.string().optional(),
  })
  .refine((p) => Boolean(p.id || p.client_id), {
    message: 'A client is required to create a document.',
    path: ['client_id'],
  })

export const letterInputSchema = z
  .object({
    id: z.string().optional(),
    client_id: z.string().optional(),
    title: optionalText,
    content: z.string().optional(),
    recipient: optionalText,
    letter_date: dateString.optional(),
  })
  .refine((p) => Boolean(p.id || p.client_id), {
    message: 'A client is required to create a letter.',
    path: ['client_id'],
  })

export const appointmentInputSchema = z
  .object({
    id: z.string().optional(),
    client_id: z.string().optional(),
    episode_id: z.string().nullish(),
    clinician_id: z.string().nullish(),
    session_date: dateString.optional(),
    start_time: timeString.optional(),
    end_time: timeString.optional(),
    scheduled_at: z.string().optional(),
    duration_minutes: z.coerce.number().positive().optional(),
    appointment_type: z.enum(appointmentTypeKeys).optional(),
    therapy_modality: z.string().optional(),
    attendance_status: z.enum(attendanceStatusKeys).nullish(),
    location: optionalText,
    notes: z.string().optional(),
    other_info: z.string().optional(),
  })
  .refine((p) => Boolean(p.id || p.client_id), {
    message: 'A client is required to schedule an appointment.',
    path: ['client_id'],
  })
  .refine((p) => Boolean(p.id || p.session_date || p.scheduled_at), {
    message: 'A date is required to schedule an appointment.',
    path: ['session_date'],
  })

export const workplaceInputSchema = z.object({
  name: requiredText('Workplace name'),
  join_code: optionalText,
  logo_url: optionalText,
  address_line1: optionalText,
  address_line2: optionalText,
  address_line3: optionalText,
  postcode: optionalText,
  country: optionalText,
})

export const workplaceBrandingUpdateSchema = z.object({
  logo_url: optionalText,
  address_line1: requiredText('Address line 1'),
  address_line2: optionalText,
  address_line3: optionalText,
  postcode: optionalText,
  country: optionalText,
})

export const practiceBrandingUpdateSchema = z.object({
  practice_name: optionalText,
  practice_logo_url: optionalText,
  practice_address_line1: requiredText('Address line 1'),
  practice_address_line2: optionalText,
  practice_address_line3: optionalText,
  practice_postcode: optionalText,
  practice_country: optionalText,
})

const dayHoursSchema = z.object({
  enabled: z.boolean(),
  start: timeString,
  end: timeString,
})

const weeklyHoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
})

export const workplaceClinicianSettingSchema = z.object({
  workplace_id: requiredText('Workplace'),
  weekly_hours: weeklyHoursSchema,
  service_ids: z.array(z.string()).default([]),
})

export const clinicianWorkplaceSettingsSchema = z.array(workplaceClinicianSettingSchema).min(1)

export const clinicianUserInputSchema = z.object({
  full_name: requiredText('Full name'),
  hcpc_number: optionalText,
  job_title: optionalText,
  bio: z.string().optional(),
})

export const orgServiceInputSchema = z.object({
  service_type: z.enum(['appointment', 'admin', 'busy']).optional(),
  name: requiredText('Service name'),
  description: z.string().optional(),
  color: z.string().optional(),
  slug: z.string().optional(),
})

export const orgTemplateInputSchema = z.object({
  id: z.string().optional(),
  name: requiredText('Template name'),
  description: z.string().optional(),
  workplace_id: z.string().nullish(),
  content: z.string().optional(),
  is_active: z.boolean().optional(),
})

const JOURNAL_SOMATIC_STATES = [
  'Grounded',
  'Activated',
  'Fatigued',
  'Open',
  'Constricted',
  'Settled',
] as const

export const journalEntryInputSchema = z.object({
  id: z.string().optional(),
  date: dateString,
  time: timeString.optional(),
  somatic_state: z.enum(JOURNAL_SOMATIC_STATES).optional(),
  body_text: z.string().optional(),
})

export const clientClinicalDetailsSchema = z.object({
  diagnosis: optionalText,
  medication: optionalText,
  school: optionalText,
})

export const clinicalProfileInputSchema = z.object({
  recurring_themes: optionalText,
  sensory_considerations: optionalText,
  preferred_modalities_notes: optionalText,
  clinical_goals: optionalText,
  working_formulation: optionalText,
})

/**
 * Parse `data` against `schema`, throwing a single human-readable Error on
 * failure. Existing call sites already surface `err.message`, so validation
 * failures flow straight to the user without new plumbing.
 */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown, label = 'Input'): T {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const where = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
  throw new Error(`${label} — ${where}${issue?.message || 'Invalid input.'}`)
}
