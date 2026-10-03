import ClinicianJournal from '../profile/ClinicianJournal'
import PageHeader from '../../components/PageHeader'

export default function JournalPage() {
  return (
    <div className="page page--journal">
      <PageHeader
        title="Journal"
        subtitle="Private reflective space for your practice."
      />
      <ClinicianJournal />
    </div>
  )
}
