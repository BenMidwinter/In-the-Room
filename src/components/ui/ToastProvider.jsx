import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

/** Access the toast API: `toast.success(msg)`, `.error(msg)`, `.info(msg)`. */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const TONE = {
  info: 'border-l-primary',
  success: 'border-l-[color:var(--somatic-grounded-border)]',
  error: 'border-l-secondary',
}

let idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, { type = 'info', duration } = {}) => {
      if (!message) return null
      const id = ++idSeq
      const ttl = duration ?? (type === 'error' ? 6000 : 4000)
      setToasts((list) => [...list, { id, message: String(message), type }])
      if (ttl) timers.current.set(id, setTimeout(() => dismiss(id), ttl))
      return id
    },
    [dismiss],
  )

  const toast = useMemo(
    () => ({
      show: (msg, opts) => push(msg, opts),
      info: (msg, opts) => push(msg, { ...opts, type: 'info' }),
      success: (msg, opts) => push(msg, { ...opts, type: 'success' }),
      error: (msg, opts) => push(msg, { ...opts, type: 'error' }),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex items-start gap-3 border border-line border-l-4 bg-surface px-4 py-3 text-[0.9rem] text-ink shadow-md ${TONE[t.type] || TONE.info}`}
          >
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="-my-1 -mr-1 shrink-0 cursor-pointer border-0 bg-transparent px-1 text-lg leading-none text-subtle hover:text-ink"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
