import { matchPath } from 'react-router-dom'

const SERVICE_LEAD_PAGE_ROUTES = [
  {
    path: '/service-lead',
    end: true,
    title: 'Organisation overview',
    subtitle: 'Workplace aggregates and compliance — no client-identifying detail.',
  },
  {
    path: '/service-lead/workplaces',
    end: true,
    title: 'Workplaces',
    subtitle: 'Create organisation workplaces. Clinicians search for a site and request to join; clinical leads approve membership.',
  },
  {
    path: '/service-lead/users',
    end: true,
    title: 'Users',
    subtitle: 'Add clinician accounts. They can search for a workplace and request to join — clinical leads approve membership.',
  },
  {
    path: '/service-lead/services',
    end: true,
    title: 'Services',
    subtitle: 'Define services by type so inputs can be tracked against client profiles in future reporting.',
  },
  {
    path: '/service-lead/progress-note-templates/:templateId',
    title: ({ templateId }) => (
      templateId === 'new' ? 'New progress note template' : 'Edit progress note template'
    ),
    subtitle: 'Use merge fields for client and session details.',
  },
  {
    path: '/service-lead/progress-note-templates',
    end: true,
    title: 'Progress note templates',
    subtitle: 'Standard structures clinicians start from when writing session notes.',
  },
  {
    path: '/service-lead/letter-templates/:templateId',
    title: ({ templateId }) => (
      templateId === 'new' ? 'New letter template' : 'Edit letter template'
    ),
    subtitle: 'Use merge fields for client details.',
  },
  {
    path: '/service-lead/letter-templates',
    end: true,
    title: 'Letter templates',
    subtitle: 'Reusable letter structures for GPs, schools, referrers, and discharge summaries.',
  },
  {
    path: '/service-lead/outcome-forms',
    end: true,
    title: 'Outcome forms & measures',
    subtitle: 'Configure standardised outcome tools assigned to workplaces and client records.',
  },
]

const DEFAULT_META = {
  title: 'Service Lead',
  subtitle: 'Organisation oversight — workplaces, compliance, and configuration.',
}

/** Resolve page title and subtitle for the current Service Lead route. */
export function getServiceLeadPageMeta(pathname) {
  for (const route of SERVICE_LEAD_PAGE_ROUTES) {
    const match = matchPath({ path: route.path, end: route.end ?? false }, pathname)
    if (!match) continue

    const title = typeof route.title === 'function'
      ? route.title(match.params as { templateId: string })
      : route.title

    return {
      title,
      subtitle: route.subtitle,
    }
  }

  return DEFAULT_META
}
