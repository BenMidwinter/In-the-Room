import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function placePanel(rect) {
  const width = 288
  let left = rect.left
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12)
  let top = rect.bottom + 8
  if (top + 160 > window.innerHeight - 12) top = Math.max(12, rect.top - 168)
  return { top, left, width }
}

function LightbulbIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        d="M8 1.7a3.9 3.9 0 0 0-2.15 7.15c.35.28.55.7.55 1.15V11.2h3.2v-1.2c0-.45.2-.87.55-1.15A3.9 3.9 0 0 0 8 1.7z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M6.3 12.7h3.4M6.7 14.1h2.6" />
    </svg>
  )
}

/** Discreet overview for a page or section. The sentence stays hidden until the lightbulb is opened. */
export default function HelpTip({ text, label = 'About this page' }) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event) => {
      const target = event.target
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setBox(placePanel(rect))
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  if (!text) return null

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setBox(placePanel(rect))
    setOpen(true)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? 'help-tip help-tip--open' : 'help-tip'}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <LightbulbIcon />
      </button>
      {open && box ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          className="help-tip__panel"
          role="note"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {text}
        </div>,
        document.body,
      ) : null}
    </>
  )
}
