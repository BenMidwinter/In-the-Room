import { useEffect, useRef } from 'react'

export default function SignaturePad({ onCancel, onSave }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.25
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a3a5c'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawingRef.current = false
    lastPointRef.current = null
  }, [])

  const getPoint = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = event.touches ? event.touches[0].clientX : event.clientX
    const clientY = event.touches ? event.touches[0].clientY : event.clientY
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDraw = (event) => {
    event.preventDefault()
    drawingRef.current = true
    lastPointRef.current = getPoint(event)
  }

  const draw = (event) => {
    if (!drawingRef.current) return
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(event)
    const last = lastPointRef.current
    if (!last) return
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
  }

  const endDraw = () => {
    drawingRef.current = false
    lastPointRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const save = () => {
    const canvas = canvasRef.current
    onSave?.(canvas.toDataURL('image/png'))
  }

  return (
    <div className="signature-pad" role="dialog" aria-label="Draw your signature">
      <p className="signature-pad__label">Draw your signature</p>
      <canvas
        ref={canvasRef}
        className="signature-pad__canvas"
        width={420}
        height={140}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="signature-pad__actions">
        <button type="button" className="secondary" onClick={clear}>Clear</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" onClick={save}>Insert</button>
      </div>
    </div>
  )
}
