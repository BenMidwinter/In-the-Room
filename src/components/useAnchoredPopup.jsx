import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePhoneLayout } from '../lib/usePhoneLayout'
import { placeEditorPopup } from './editorPopup'

/**
 * On a phone the formatting bar clips anything inside it, and iOS also clips
 * position:fixed descendants of that scroller. Draw the menu on document.body
 * instead. Wider layouts keep the menu in the bar, over the note.
 */
export default function EditorPopup({ open, anchorRef, children }) {
  const phone = usePhoneLayout()
  const hostRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !phone) return undefined
    const place = () => {
      const anchor = anchorRef.current
      const host = hostRef.current
      if (!anchor || !host) return
      placeEditorPopup(anchor, host)
    }
    place()
    const toolbar = anchorRef.current?.closest('.doc-editor__toolbar')
    toolbar?.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      toolbar?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [open, phone, anchorRef])

  if (!open) return null
  if (!phone) return children
  return createPortal(
    <div ref={hostRef} className="doc-editor__popup-host" data-editor-popup>
      {children}
    </div>,
    document.body,
  )
}
