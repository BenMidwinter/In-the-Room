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
    let lastY = 0
    const rememberTouch = (event) => {
      lastY = event.touches[0]?.clientY ?? lastY
    }
    const keepPageStill = (event) => {
      const palette = event.target instanceof Element
        ? event.target.closest('.doc-editor__popup-host--card .doc-editor__palette')
        : null
      const currentY = event.touches[0]?.clientY ?? lastY
      const dy = currentY - lastY
      lastY = currentY
      if (palette && palette.scrollHeight > palette.clientHeight + 1) {
        const atTop = palette.scrollTop <= 0
        const atBottom = palette.scrollTop + palette.clientHeight >= palette.scrollHeight - 1
        if ((atTop && dy > 0) || (atBottom && dy < 0)) event.preventDefault()
        return
      }
      event.preventDefault()
    }
    document.addEventListener('touchstart', rememberTouch, { passive: true })
    document.addEventListener('touchmove', keepPageStill, { passive: false })
    return () => {
      toolbar?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
      document.removeEventListener('touchstart', rememberTouch)
      document.removeEventListener('touchmove', keepPageStill)
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
