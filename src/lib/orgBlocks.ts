/** Service Lead / organisation overview block metadata. */

export const ORG_OVERVIEW_BLOCK_ORDER = [
  'org_pulse',
  'site_performance',
  'compliance_activity',
]

export const ORG_BLOCK_META = {
  org_pulse: {
    id: 'org_pulse',
    label: 'Organisation',
    title: 'Organisation pulse',
    description: 'Headline metrics across all workplaces this working week.',
  },
  site_performance: {
    id: 'site_performance',
    label: 'Sites',
    title: 'Site performance',
    description: 'Attendance and documentation compliance compared by workplace.',
  },
  compliance_activity: {
    id: 'compliance_activity',
    label: 'Activity',
    title: 'Compliance & activity',
    description: 'Aggregated session volume and caseload — no client-identifying detail.',
  },
  org_workplaces: {
    id: 'org_workplaces',
    label: 'Structure',
    title: 'Workplaces',
    description: 'Create organisation workplaces and manage join codes.',
  },
  org_users: {
    id: 'org_users',
    label: 'Structure',
    title: 'Users',
    description: 'Clinician accounts and workplace membership.',
  },
  org_services: {
    id: 'org_services',
    label: 'Catalogue',
    title: 'Services',
    description: 'Appointment, admin, and busy-time service definitions.',
  },
  org_note_templates: {
    id: 'org_note_templates',
    label: 'Configuration',
    title: 'Progress note templates',
    description: 'Session note structures with merge fields.',
  },
  org_letter_templates: {
    id: 'org_letter_templates',
    label: 'Configuration',
    title: 'Letter templates',
    description: 'Reusable letters for referrers and discharge.',
  },
  org_outcome_forms: {
    id: 'org_outcome_forms',
    label: 'Configuration',
    title: 'Outcome forms & measures',
    description: 'Standardised outcome tools for client records.',
  },
  org_note_template_editor: {
    id: 'org_note_template_editor',
    label: 'Configuration',
    title: 'Progress note template',
    description: 'Template editor with merge-field preview.',
  },
  org_letter_template_editor: {
    id: 'org_letter_template_editor',
    label: 'Configuration',
    title: 'Letter template',
    description: 'Template editor with merge-field preview.',
  },
}
