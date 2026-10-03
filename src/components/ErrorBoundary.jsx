import { Component } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Crash-isolation boundary. A render/lifecycle throw in any wrapped subtree is
 * caught here so it cannot take down the whole app session. Callers may pass a
 * custom `fallback` (node or ({ error, reset }) => node) and `resetKeys` — when
 * any reset key changes, the boundary clears its error and re-renders children.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Central place to forward to a real error reporter later.
    console.error('[ErrorBoundary]', this.props.label || 'unlabelled', error, info)
  }

  componentDidUpdate(prevProps) {
    if (!this.state.error) return
    const { resetKeys } = this.props
    if (!resetKeys || !prevProps.resetKeys) return
    const changed =
      resetKeys.length !== prevProps.resetKeys.length ||
      resetKeys.some((key, i) => !Object.is(key, prevProps.resetKeys[i]))
    if (changed) this.reset()
  }

  reset() {
    this.props.onReset?.()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const { fallback } = this.props
    if (typeof fallback === 'function') return fallback({ error, reset: this.reset })
    if (fallback) return fallback

    return (
      <div className="page">
        <div className="card empty-state" role="alert">
          <p><strong>Something went wrong in this section.</strong></p>
          <p className="text-muted text-small">
            The rest of the app is still running. You can retry this section or navigate away.
          </p>
          {import.meta.env?.DEV && (
            <pre
              className="text-small text-muted"
              style={{ whiteSpace: 'pre-wrap', textAlign: 'left', marginTop: '0.75rem' }}
            >
              {error.message}
            </pre>
          )}
          <div className="form-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <button type="button" className="primary" onClick={this.reset}>Try again</button>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Route-scoped boundary: automatically resets when the pathname changes, so a
 * crash in one feature clears itself once the user navigates elsewhere.
 */
export function RouteErrorBoundary({ children }) {
  const location = useLocation()
  return (
    <ErrorBoundary label={location.pathname} resetKeys={[location.pathname]}>
      {children}
    </ErrorBoundary>
  )
}
