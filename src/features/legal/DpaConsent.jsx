import { Link } from 'react-router-dom'
import { DPA_PATH } from '../../lib/dpa'

export default function DpaConsent({ checked, onChange, id = 'dpa-consent' }) {
  return (
    <div className="dpa-consent">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
      />
      <label htmlFor={id}>
        I accept the{' '}
        <Link to={DPA_PATH} target="_blank" rel="noopener noreferrer">
          Data Processing Agreement (DPA)
        </Link>
        , version 1.1, confirming that Process&Note acts as a Data Processor on my behalf.
        Clinical records and encryption keys remain in the United Kingdom (London, eu-west-2).
        The other sub-processors are listed in the agreement.
      </label>
    </div>
  )
}
