import PageHeader from './PageHeader'

export default function Reporting() {
  return (
    <div className="page">
      <PageHeader
        title="Reporting"
        subtitle="Organisation-wide analytics and exportable clinical reports."
      />
      <div className="reporting-placeholder">
        <p className="reporting-placeholder__lead">
          Reporting dashboards are under construction. This area will surface caseload trends,
          outcome measure roll-ups, and modality utilisation across your workplaces.
        </p>
        <ul className="reporting-placeholder__list">
          <li>Session volume by workplace and clinician</li>
          <li>Outcome measure completion rates</li>
          <li>Modality mix and referral source breakdown</li>
          <li>Exportable PDF and CSV packs for governance</li>
        </ul>
      </div>
    </div>
  )
}
