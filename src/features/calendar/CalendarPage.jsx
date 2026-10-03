import { useAppSession } from '../../lib/AppSessionContext'
import CalendarModule from './CalendarModule'
import ErrorBoundary from '../../components/ErrorBoundary'

export default function Calendar() {
  const { activePersona } = useAppSession()

  return (
    <div className="page page--calendar">
      <ErrorBoundary
        label="calendar-module"
        resetKeys={[activePersona?.id]}
        fallback={({ reset }) => (
          <div className="card empty-state" role="alert">
            <p><strong>The calendar failed to render.</strong></p>
            <p className="text-muted text-small">This is isolated to the calendar — the rest of the app is unaffected.</p>
            <div className="form-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
              <button type="button" className="primary" onClick={reset}>Reload calendar</button>
            </div>
          </div>
        )}
      >
        <CalendarModule persona={activePersona} />
      </ErrorBoundary>
    </div>
  )
}
