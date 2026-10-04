import { useEffect, useRef, useState } from 'react'

export default function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState(null)
  const root = useRef(null)
  const button = useRef(null)
  const visible = items.filter((item) => !item.hidden)

  const place = () => {
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom
    const upward = below < 200 && rect.top > below
    setBox({
      top: upward ? rect.top - 4 : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
      translateY: upward ? '-100%' : '0',
    })
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (!visible.length) return null

  return (
    <div
      className="row-menu"
      ref={root}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="row-menu__button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={button}
        onClick={() => {
          if (open) setOpen(false)
          else {
            place()
            setOpen(true)
          }
        }}
      >
        ···
      </button>
      {open && (
        <div
          className="row-menu__list"
          role="menu"
          style={box ? {
            top: box.top,
            right: box.right,
            transform: `translateY(${box.translateY})`,
          } : undefined}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`row-menu__item${item.danger ? ' row-menu__item--danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
