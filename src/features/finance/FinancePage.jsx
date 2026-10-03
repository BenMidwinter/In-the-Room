import { useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { getFreelanceFinancePack, formatGbp } from '../../lib/financeMock'

const TABS = [
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'invoices', label: 'Invoices' },
]

const EMPTY_COPY = {
  timesheets: {
    title: 'No timesheets yet',
    body: 'Log session hours here, then sync them to Xero when you connect your practice accounting.',
  },
  expenses: {
    title: 'No expenses yet',
    body: 'Travel, materials, and supervision costs will land here — ready to push into Xero.',
  },
  invoices: {
    title: 'No invoices yet',
    body: 'Draft client invoices from completed sessions. Xero sync is planned for private practitioners first.',
  },
}

export default function FinancePage() {
  const [tab, setTab] = useState('timesheets')
  const data = getFreelanceFinancePack()
  const empty = EMPTY_COPY[tab]

  return (
    <div className="page page--finance">
      <PageHeader
        title="Finance"
        subtitle="Private practice timesheets, expenses, and invoicing — Xero integration coming"
        toolbar={<span className="finance-page__xero-pill">Xero sync soon</span>}
      />

      <div className="role-block__stat-row finance-page__stats">
        <div className="role-block__stat">
          <span className="role-block__stat-value">{data.summary.hoursSubmitted}h</span>
          <span className="role-block__stat-label">Hours submitted</span>
        </div>
        <div className="role-block__stat">
          <span className="role-block__stat-value">{data.summary.hoursDraft}h</span>
          <span className="role-block__stat-label">Hours in draft</span>
        </div>
        <div className="role-block__stat">
          <span className="role-block__stat-value">{data.summary.expensesPending}</span>
          <span className="role-block__stat-label">Expenses pending</span>
        </div>
        <div className="role-block__stat">
          <span className="role-block__stat-value">{data.summary.invoicesDraft}</span>
          <span className="role-block__stat-label">Invoices to send</span>
        </div>
        <div className="role-block__stat">
          <span className="role-block__stat-value">{formatGbp(data.summary.invoiceValueOpen || 0)}</span>
          <span className="role-block__stat-label">Open invoice value</span>
        </div>
      </div>

      <div className="finance-tabs" role="tablist" aria-label="Finance sections">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`finance-tabs__btn${tab === item.id ? ' finance-tabs__btn--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="finance-panel">
        <section className="finance-card">
          <div className="finance-card__body">
            <h2 className="finance-card__title">{empty.title}</h2>
            <p className="text-muted" style={{ marginTop: '0.5rem', lineHeight: 1.7 }}>
              {empty.body}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
