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
  { key: 'recurring_themes', label: 'Recurring themes' },
  { key: 'sensory_considerations', label: 'Sensory considerations' },
  { key: 'working_formulation', label: 'Working formulation' },
  { key: 'clinical_goals', label: 'Clinical goals' },
  { key: 'preferred_modalities', label: 'Preferred modalities' },
  { key: 'clinician_name', label: 'Clinician name' },
  { key: 'clinician_title', label: 'Clinician title' },
  { key: 'clinician_hcpc', label: 'HCPC number' },
]

function formatDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function buildMergeContext({
  client,
  appointment,
  profile,
  sessionDate,
}: {
  client?: ClientClinicalRecord & { real_name?: string; dob?: string }
  appointment?: { appointment_type?: string; location?: string } | null
  profile?: { full_name?: string; job_title?: string; hcpc_number?: string } | null
  sessionDate?: string
}) {
  return {
    client_name: client?.real_name || '',
    client_dob: client?.dob || '',
    session_date: formatDisplayDate(sessionDate),
    service_type: appointment
      ? (APPOINTMENT_TYPES[appointment.appointment_type as keyof typeof APPOINTMENT_TYPES] || appointment.appointment_type)
      : '',
    appointment_location: appointment?.location || '',
    clinician_name: profile?.full_name || '',
    clinician_title: profile?.job_title || '',
    clinician_hcpc: profile?.hcpc_number || '',
    ...clinicalProfileMergeValues(client),
  }
}
