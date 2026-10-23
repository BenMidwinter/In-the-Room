import { useLayoutEffect, useState } from 'react'

function popupStyleFor(anchor) {
  const toolbar = anchor?.closest('.doc-editor__toolbar')
  if (!anchor || !toolbar) return undefined
  const overflowX = getComputedStyle(toolbar).overflowX
  if (overflowX !== 'auto' && overflowX !== 'scroll') return undefined
  const rect = anchor.getBoundingClientRect()
  const margin = 8
  const maxWidth = Math.min(360, window.innerWidth - margin * 2)
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - maxWidth))
  const top = Math.min(rect.bottom + 4, window.innerHeight - margin)
  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    right: 'auto',
    zIndex: 80,
    maxWidth: `${maxWidth}px`,
  }
}

/**
 * Place a toolbar menu in the viewport when the formatting bar scrolls
 * sideways. A menu inside that bar would be clipped.
 */
export default function useAnchoredPopup(open, anchorRef) {
  const [style, setStyle] = useState(undefined)

  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => setStyle(popupStyleFor(anchorRef.current))
    const frame = requestAnimationFrame(place)
    const toolbar = anchorRef.current?.closest('.doc-editor__toolbar')
    toolbar?.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(frame)
      toolbar?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef])

  return open ? style : undefined
}
