import { Link } from 'react-router-dom'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'
import DpaDocument from './DpaDocument'

export default function DpaPage() {
  return (
    <div className="legal-page">
      <div className="legal-page__bar">
        <Link to="/login" className="legal-page__brand">
          <img src={brandLogoUrl} alt={PRODUCT_NAME} />
        </Link>
      </div>
      <DpaDocument />
    </div>
  )
}
