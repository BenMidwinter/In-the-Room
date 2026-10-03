import PageHeader from './PageHeader'

export default function Reporting() {
  return (
    <div className="page">
      <PageHeader
        title="Reporting"
        subtitle="Practice analytics and exportable reports for your caseload."
      />
      <div className="reporting-placeholder">
        <p className="reporting-placeholder__lead">
          Reporting is under construction. This area will surface caseload trends,
          outcome measure roll-ups, modality utilisation, and audit activity for your practice.
        </p>
        <ul className="reporting-placeholder__list">
          <li>Session volume by period and service</li>
          <li>Outcome measure completion rates</li>
          <li>Modality mix and referral source breakdown</li>
          <li>Exportable PDF and CSV packs for your records</li>
          <li>Audit activity for clinical and admin changes</li>
        </ul>
      </div>
    </div>
  )
}
