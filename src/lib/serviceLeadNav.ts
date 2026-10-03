/** Service Lead secondary nav — grouped by organisational domain. */

export const SERVICE_LEAD_NAV_GROUPS = [
  {
    id: 'overview',
    items: [
      { to: '/service-lead', label: 'Overview', end: true },
    ],
  },
  {
    id: 'organisation',
    label: 'Organisation',
    items: [
      { to: '/service-lead/workplaces', label: 'Workplaces' },
      { to: '/service-lead/users', label: 'Users' },
      { to: '/service-lead/services', label: 'Services' },
    ],
  },
  {
    id: 'templates',
    label: 'Templates',
    items: [
      { to: '/service-lead/progress-note-templates', label: 'Note templates', matchPrefix: '/service-lead/progress-note-templates' },
      { to: '/service-lead/letter-templates', label: 'Letter templates', matchPrefix: '/service-lead/letter-templates' },
      { to: '/service-lead/outcome-forms', label: 'Outcome forms' },
    ],
  },
]

/** Whether a nav item should show as active for the current pathname. */
export function isServiceLeadNavItemActive(pathname, item) {
  if (item.matchPrefix) {
    return pathname === item.to || pathname.startsWith(`${item.matchPrefix}/`)
  }
  if (item.end) {
    return pathname === item.to
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
