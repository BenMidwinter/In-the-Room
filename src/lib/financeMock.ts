/** Freelance finance placeholders (pre-Xero). Empty until a private practice connects accounting. */

export function formatGbp(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

export function financeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
    ready: 'Ready for Xero',
    sent: 'Sent',
    paid: 'Paid',
  }
  return labels[status] || status
}

export type FreelanceFinancePack = {
  practiceName: string
  weekLabel: string
  timesheets: unknown[]
  expenses: unknown[]
  invoices: unknown[]
  summary: {
    hoursSubmitted: number
    hoursDraft: number
    expensesPending: number
    invoicesDraft: number
    invoiceValueOpen: number
  }
}

/** Empty freelance finance pack — UI shows Xero-ready placeholders with no fake rows. */
export function getFreelanceFinancePack(): FreelanceFinancePack {
  return {
    practiceName: 'Private practice',
    weekLabel: '',
    timesheets: [],
    expenses: [],
    invoices: [],
    summary: {
      hoursSubmitted: 0,
      hoursDraft: 0,
      expensesPending: 0,
      invoicesDraft: 0,
      invoiceValueOpen: 0,
    },
  }
}

/** @deprecated workplace packs removed — freelancers use getFreelanceFinancePack() */
export function getFinanceMockForWorkplace(_workplace?: { id?: string; name?: string } | null) {
  return {
    ...getFreelanceFinancePack(),
    workplaceName: 'Private practice',
  }
}
