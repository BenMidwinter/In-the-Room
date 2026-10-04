import { createPortal } from 'react-dom'
import { WorkspaceLayout, StickyContextBar } from '../../components/LayoutComponents'

/**
 * Full writing space in the main column, the same shape as a process note.
 */
export default function DocumentWorkspace({
  title,
  clientName,
  onBack,
  actions,
  meta,
  children,
  letter = false,
}) {
  const page = (
    <div className="clinical-doc-overlay">
      <WorkspaceLayout className={`clinical-doc-page${letter ? ' clinical-doc-page--letter' : ''}`}>
        <StickyContextBar
          className="progress-notes-page__header"
          leading={(
            <>
              <button type="button" className="secondary" onClick={onBack}>Back</button>
              <h1>{title}</h1>
              {clientName ? <span className="text-small text-muted">{clientName}</span> : null}
            </>
          )}
          trailing={<div className="progress-notes-page__header-actions">{actions}</div>}
        />
        {meta ? (
          <div className="progress-notes-page__meta-bar" role="group" aria-label="Document details">
            {meta}
          </div>
        ) : null}
        <div className="note-split">
          <main className="note-split__editor progress-notes-page__editor">
            <div className="progress-notes-page__canvas-zone">
              {children}
            </div>
          </main>
        </div>
      </WorkspaceLayout>
    </div>
  )

  const host = typeof document === 'undefined'
    ? null
    : (document.querySelector('.main-content') || document.body)
  if (!host) return page
  return createPortal(page, host)
}
