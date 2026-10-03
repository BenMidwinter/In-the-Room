import PlaceholderPage from './PlaceholderPage'
import PageHeader from './PageHeader'

export default function Resources() {
  return (
    <div className="page">
      <PageHeader title="Resources" subtitle="Shared clinical resources and workplace library." />
      <PlaceholderPage
        icon="📁"
        title="Resources coming soon"
        subtitle="Upload and browse shared documents, templates, and workplace materials."
      />
    </div>
  )
}
