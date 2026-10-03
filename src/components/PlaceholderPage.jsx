export default function PlaceholderPage({ title, subtitle, icon = '🚧' }) {
  return (
    <div className="page">
      <div className="card placeholder">
        <div className="placeholder__icon">{icon}</div>
        <p className="placeholder__title">{title}</p>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}
