/**
 * Empty collection seeds for In the Room.
 * Clinical data will be encrypted client-side and persisted via Supabase —
 * this in-memory layer starts blank (no demo / fake records).
 */

export const DEMO_PERSONA_ACCOUNTS = {
  clinician: {
    userId: 'user-local',
    name: 'Clinician',
    serviceLead: false,
    memberships: [],
  },
}

export const DEMO_CLINICAL_LEAD_USER_ID = DEMO_PERSONA_ACCOUNTS.clinician.userId
export const DEMO_SERVICE_LEAD_USER_ID = 'user-unused-service-lead'
export const DEFAULT_DEMO_PERSONA_ID = 'clinician'

export const CURRENT_USER = {
  id: DEMO_CLINICAL_LEAD_USER_ID,
  email: '',
  name: DEMO_PERSONA_ACCOUNTS.clinician.name,
  isAdmin: false,
  isServiceLead: false,
}

export const CLINICIAN_WORKPLACES = []

export const WORKPLACES = []

export const CLINICIAN_PROFILES = [
  {
    id: DEMO_CLINICAL_LEAD_USER_ID,
    full_name: '',
    job_title: 'Creative Arts Therapist',
    hcpc_number: '',
    email: '',
    phone: '',
    bio: '',
  },
]

export const CLIENTS = []
export const BODY_MAPS = {}
export const WORKPLACE_AUDIT_LOGS = []
export const MEMBERSHIP_REQUESTS = []
export const TIMELINE_EVENTS = []
export const PROGRESS_NOTES = []
export const WORKING_DOCUMENTS = []
export const EPISODES = []
export const LETTERS = []
export const PROGRESS_NOTE_TEMPLATES = []
export const LETTER_TEMPLATES = []

/** Organisation services — trackable inputs classified by time type. */
export const ORG_SERVICE_TYPES = {
  appointment: 'Appointment',
  admin: 'Admin',
  busy: 'Busy',
}

export const ORG_SERVICES = []

export const APPOINTMENT_TYPES = {
  one_to_one: '1:1 session',
  group: 'Group session',
  consultation: 'Consultation',
}

export const ATTENDANCE_STATUSES = {
  attended: 'Attended',
  did_not_attend: 'Did not attend',
  cancelled: 'Cancelled',
}

export const APPOINTMENTS = []
export const CLINICIAN_JOURNAL_ENTRIES = []
