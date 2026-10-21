import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import EditorInspector from '../../components/EditorInspector'
import { WorkspaceLayout, StickyContextBar } from '../../components/LayoutComponents'
import { usePhoneLayout } from '../../lib/usePhoneLayout'

/**
 * Full writing space in the main column, the same shape as a process note.
 * On a phone, metadata moves into a details sheet so the page stays a writing surface.
 */
export default function DocumentWorkspace({
  title,
  clientName,
  onBack,
  actions,
  inspectorExtras = null,
  contextLabel = '',
  meta,
  children,
  letter = false,
}) {
  const phone = usePhoneLayout()
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const canvasRef = useRef(null)
  const showInspector = phone && Boolean(meta || inspectorExtras)
  const hasHeaderActions = Boolean((!phone && inspectorExtras) || actions)

  const closeInspector = () => {
    setInspectorOpen(false)
    window.requestAnimationFrame(() => {
      canvasRef.current?.querySelector('.ProseMirror')?.focus()
    })
  }

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
          meta={showInspector ? (
            <button
              type="button"
              className="editor-context-chip"
              aria-expanded={inspectorOpen}
              aria-haspopup="dialog"
              onClick={() => setInspectorOpen(true)}
            >
              {contextLabel || 'Details'}
            </button>
          ) : null}
          trailing={hasHeaderActions ? (
            <div className="progress-notes-page__header-actions">
              {!phone && inspectorExtras}
              {actions}
            </div>
          ) : null}
        />
        {meta && !phone ? (
          <div className="progress-notes-page__meta-bar" role="group" aria-label="Document details">
            {meta}
          </div>
        ) : null}
        <div className="note-split" ref={canvasRef}>
          <main className="note-split__editor progress-notes-page__editor">
            <div className="progress-notes-page__canvas-zone">
              {children}
            </div>
          </main>
        </div>
        {showInspector && (
          <EditorInspector open={inspectorOpen} title="Details" onClose={closeInspector}>
            {meta ? (
              <div className="progress-notes-page__meta-bar" role="group" aria-label="Document details">
                {meta}
              </div>
            ) : null}
            {inspectorExtras ? (
              <div className="editor-inspector__extras">{inspectorExtras}</div>
            ) : null}
          </EditorInspector>
        )}
      </WorkspaceLayout>
    </div>
  )

  const host = typeof document === 'undefined'
    ? null
    : (document.querySelector('.viewport-tray') || document.querySelector('.main-content') || document.body)
  if (!host) return page
  return createPortal(page, host)
}
