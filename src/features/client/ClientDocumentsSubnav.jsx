import { useSearchParams } from 'react-router-dom'
import SectionNav from '../../components/SectionNav'

/** Full-bleed document-type nav, stacked under the client section nav. */
export default function ClientDocumentsSubnav() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('type') === 'working' ? 'working' : 'letters'

  const setTab = (next) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'working') nextParams.set('type', 'working')
    else nextParams.delete('type')
    setParams(nextParams, { replace: true })
  }

  return (
    <SectionNav
      label="Document types"
      className="client-nav-bar--sub"
      items={[
        { key: 'letters', label: 'Letters', active: tab === 'letters', onSelect: () => setTab('letters') },
        { key: 'working', label: 'Working documents', active: tab === 'working', onSelect: () => setTab('working') },
      ]}
    />
  )
}
