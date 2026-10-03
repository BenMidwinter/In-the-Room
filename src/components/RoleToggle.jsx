import { DEMO_ROLE_OPTIONS } from '../lib/permissions'

export default function RoleToggle({ value, onChange }) {
  return (
    <div className="role-select">
      <label htmlFor="demo-role-select" className="role-select__label">
        View as
      </label>
      <select
        id="demo-role-select"
        className="role-select__control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Preview role"
      >
        {DEMO_ROLE_OPTIONS.map(({ value: roleValue, label }) => (
          <option key={roleValue} value={roleValue}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}
