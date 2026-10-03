import { useEffect } from 'react'

/**
 * Central modal overlay for edit/create forms (services, appointments, etc.).
 * Reuses the client-profile overlay visual language so all editors feel consistent.
 */
export default function FormOverlay({
  title,
  eyebrow,
  meta,
  onClose,
  children,
  size = 'md',
  footer = null,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="form-overlay" role="presentation">
      <button
        type="button"
        className="form-overlay__backdrop"
        onClick={onClose}
        aria-label="Close overlay"
      />
      <div
        className={`form-overlay__panel form-overlay__panel--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-overlay-title"
      >
        <header className="form-overlay__header">
          <div className="form-overlay__intro">
            {eyebrow && <p className="form-overlay__eyebrow">{eyebrow}</p>}
            <h2 id="form-overlay-title" className="form-overlay__title">{title}</h2>
            {meta && <p className="form-overlay__meta">{meta}</p>}
          </div>
          <button type="button" className="form-overlay__close secondary" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="form-overlay__body">{children}</div>
        {footer && <footer className="form-overlay__footer">{footer}</footer>}
      </div>
    </div>
  )
}
