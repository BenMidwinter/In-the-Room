import { Link } from 'react-router-dom'
import { brandLogoUrl, PRODUCT_NAME } from '../../lib/brand'

export default function LegalArticle({ children }) {
  return (
    <div className="legal-page">
      <div className="legal-page__bar">
        <Link to="/login" className="legal-page__brand">
          <img src={brandLogoUrl} alt={PRODUCT_NAME} />
        </Link>
      </div>
      {children}
    </div>
  )
}
