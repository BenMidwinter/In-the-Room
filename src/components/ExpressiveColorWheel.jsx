import { useCallback, useRef } from 'react'

function hueFromPointer(event, element) {
  const rect = element.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const x = (event.clientX ?? 0) - cx
  const y = (event.clientY ?? 0) - cy
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

export default function ExpressiveColorWheel({ hue = 320, onChange }) {
  const wheelRef = useRef(null)

  const pick = useCallback((event) => {
    if (!wheelRef.current) return
    const next = hueFromPointer(event, wheelRef.current)
    onChange?.(next)
  }, [onChange])

  return (
    <div className="theme-toggle__wheel-wrap">
      <p className="theme-toggle__wheel-label">Accent colour wheel</p>
      <p className="theme-toggle__wheel-hint">
        Drag or click to shift primary, highlight, and badge tones using split-complementary harmony.
      </p>
      <button
        type="button"
        ref={wheelRef}
        className="theme-toggle__wheel"
        aria-label="Choose expressive accent colour"
        onClick={pick}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return
          pick(e)
        }}
      >
        <span
          className="theme-toggle__wheel-marker"
          style={{ transform: `rotate(${hue}deg) translateY(-38px)` }}
          aria-hidden
        />
        <span className="theme-toggle__wheel-center" aria-hidden />
      </button>
    </div>
  )
}
