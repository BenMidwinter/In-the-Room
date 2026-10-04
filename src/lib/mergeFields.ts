import { APPOINTMENT_TYPES } from './mockData'
import { clinicalProfileMergeValues, type ClientClinicalRecord } from './clinicalProfile'

export const MERGE_FIELD_OPTIONS = [
  { key: 'client_name', label: 'Client name' },
  { key: 'client_dob', label: 'Date of birth' },
  { key: 'client_diagnosis', label: 'Diagnosis' },
  { key: 'client_medication', label: 'Medication' },
  { key: 'client_school', label: 'School / setting' },
  { key: 'session_date', label: 'Session date' },
  { key: 'service_type', label: 'Service delivered' },
  { key: 'appointment_location', label: 'Location' },
  { key: 'clinician_name', label: 'Clinician name' },
  { key: 'clinician_title', label: 'Professional title' },
  { key: 'clinician_hcpc', label: 'Registration' },
]

/** Labels for fields that used to live on the clinical profile. Not offered in the menu. */
const LEGACY_MERGE_LABELS = {
  recurring_themes: 'Recurring themes',
  sensory_considerations: 'Sensory considerations',
  working_formulation: 'Working formulation',
  clinical_goals: 'Clinical goals',
  preferred_modalities: 'Preferred modalities',
}

function formatDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

type RegistrationRow = { body?: string; number?: string }

type ClinicianProfileSource = {
  full_name?: string
  display_name?: string
  job_title?: string
  professional_title?: string
  hcpc_number?: string
  registration_number?: string
  registration_numbers?: RegistrationRow[]
  signature_text?: string
  signature_image_url?: string | null
}

export function registrationText(profile: ClinicianProfileSource | null | undefined): string {
  const rows = Array.isArray(profile?.registration_numbers) ? profile.registration_numbers : []
  const parts = rows.map((row) => {
    if (!row || typeof row !== 'object') return ''
    const body = String(row.body || '').trim()
    const number = String(row.number || '').trim()
    return [body, number].filter(Boolean).join(' ')
  }).filter(Boolean)
  if (parts.length) return parts.join(', ')
  const hcpc = String(profile?.hcpc_number || '').trim()
  if (hcpc) return hcpc
  return String(profile?.registration_number || '').trim()
}

/** Shape the editor and signature menu expect, from the account profile. */
export function clinicianProfileForEditor(
  remote: ClinicianProfileSource | null | undefined,
  local: ClinicianProfileSource | null = null,
) {
  const profile = { ...(local || {}) }
  if (remote && typeof remote === 'object') {
    for (const [key, value] of Object.entries(remote)) {
      if (value !== undefined) profile[key] = value
    }
  }
  const name = String(profile.display_name || profile.full_name || '').trim()
  const title = String(profile.professional_title || profile.job_title || '').trim()
  return {
    ...profile,
    full_name: name,
    display_name: name,
    professional_title: title,
    job_title: title,
    hcpc_number: registrationText(profile),
    signature_text: profile.signature_text || name,
    signature_image_url: profile.signature_image_url || '',
  }
}

export function mergeFieldLabel(field: string): string {
  return MERGE_FIELD_OPTIONS.find((option) => option.key === field)?.label
    || LEGACY_MERGE_LABELS[field]
    || field
}

/** Template mode keeps the label. A note or report shows the record, and the label when it is empty. */
export function mergeFieldDisplay(field: string, context, mode = 'document'): string {
  const label = `{${mergeFieldLabel(field)}}`
  if (mode === 'template') return label
  const value = String(context?.[field] ?? '').trim()
  return value || label
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Replace stored field tokens with the values for this note, for print. */
export function fillMergeFields(html: string, context, mode = 'document'): string {
  if (!html) return ''
  return html.replace(
    /(<span\b[^>]*\bdata-merge-field="([^"]+)"[^>]*>)([\s\S]*?)(<\/span>)/gi,
    (_all, open, field, _inner, close) => `${open}${escapeHtml(mergeFieldDisplay(field, context, mode))}${close}`,
  )
}

export function buildMergeContext({
  client,
  appointment,
  profile,
  sessionDate,
}: {
  client?: ClientClinicalRecord & { real_name?: string; dob?: string }
  appointment?: { appointment_type?: string; location?: string } | null
  profile?: {
    full_name?: string
    display_name?: string
    job_title?: string
    professional_title?: string
    hcpc_number?: string
    registration_number?: string
    registration_numbers?: Array<{ body?: string; number?: string }>
  } | null
  sessionDate?: string
}) {
  const clinical = clinicalProfileMergeValues(client)
  const clinician = clinicianProfileForEditor(profile)
  return {
    client_name: client?.real_name || '',
    client_dob: client?.dob || '',
    client_diagnosis: clinical.client_diagnosis,
    client_medication: clinical.client_medication,
    client_school: clinical.client_school,
    session_date: formatDisplayDate(sessionDate),
    service_type: appointment
      ? (APPOINTMENT_TYPES[appointment.appointment_type as keyof typeof APPOINTMENT_TYPES] || appointment.appointment_type)
      : '',
    appointment_location: appointment?.location || '',
    clinician_name: clinician.full_name,
    clinician_title: clinician.professional_title,
    clinician_hcpc: clinician.hcpc_number,
    clinician_registration: clinician.hcpc_number,
  }
}
