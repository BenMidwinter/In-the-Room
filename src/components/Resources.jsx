import PlaceholderPage from './PlaceholderPage'
import PageHeader from './PageHeader'

export default function Resources() {
  return (
    <div className="page">
      <PageHeader
        title="Resources"
        help="Upload and browse shared documents, templates, and workplace materials."
      />
      <PlaceholderPage icon="📁" title="Resources coming soon" />
    </div>
  )
}
