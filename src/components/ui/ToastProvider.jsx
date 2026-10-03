import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

/** Access the toast API: `toast.saved()`, `.success(msg)`, `.error(msg)`, `.info(msg)`. */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const TONE = {
  info: 'app-toast--info',
  success: 'app-toast--success',
  saved: 'app-toast--saved',
  error: 'app-toast--error',
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
      const ttl = duration ?? (type === 'error' ? 6000 : type === 'saved' ? 2200 : 4000)
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
      /** Default save confirmation — Fraunces header font, short “Saved!” */
      saved: (msg = 'Saved!', opts) => push(msg, { ...opts, type: 'saved' }),
      error: (msg, opts) => push(msg, { ...opts, type: 'error' }),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="app-toast-region"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            className={`app-toast ${TONE[t.type] || TONE.info}`}
          >
            <span className="app-toast__message">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="app-toast__dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
