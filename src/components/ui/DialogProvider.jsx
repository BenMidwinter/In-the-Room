import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const DialogContext = createContext(null)

function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('Dialog hooks must be used within <DialogProvider>')
  return ctx
}

/** `await confirm('Are you sure?')` → boolean. Options: {title, message, confirmLabel, cancelLabel, tone}. */
export function useConfirm() {
  return useDialog().confirm
}

/** `await prompt({ label, defaultValue })` → string | null (null when cancelled). */
export function usePrompt() {
  return useDialog().prompt
}

function normalize(opts) {
  return typeof opts === 'string' ? { message: opts } : { ...opts }
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)

  const settle = useCallback((result) => {
    setDialog(null)
    const resolve = resolver.current
    resolver.current = null
    resolve?.(result)
  }, [])

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setDialog({ type: 'confirm', confirmLabel: 'Confirm', cancelLabel: 'Cancel', ...normalize(opts) })
      }),
    [],
  )

  const prompt = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setDialog({ type: 'prompt', confirmLabel: 'OK', cancelLabel: 'Cancel', defaultValue: '', ...normalize(opts) })
      }),
    [],
  )

  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <DialogSurface
          dialog={dialog}
          onCancel={() => settle(dialog.type === 'prompt' ? null : false)}
          onConfirm={(value) => settle(dialog.type === 'prompt' ? value : true)}
        />
      )}
    </DialogContext.Provider>
  )
}

function DialogSurface({ dialog, onCancel, onConfirm }) {
  const { type, title, message, label, placeholder, defaultValue, confirmLabel, cancelLabel, tone } = dialog
  const [value, setValue] = useState(defaultValue ?? '')
  const inputRef = useRef(null)
  const confirmRef = useRef(null)

  useEffect(() => {
    const el = type === 'prompt' ? inputRef.current : confirmRef.current
    el?.focus()
    if (type === 'prompt') inputRef.current?.select()
  }, [type])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = (e) => {
    e.preventDefault()
    onConfirm(value)
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={title || message || 'Dialog'}
        className="w-full max-w-md border border-line bg-surface p-5 shadow-md"
      >
        {title && <h2 className="m-0 mb-2 text-[1.05rem] font-bold text-accent">{title}</h2>}
        {message && <p className="m-0 text-[0.925rem] text-ink">{message}</p>}

        {type === 'prompt' && (
          <label className="mt-3 block">
            {label && <span className="mb-1 block text-[0.8rem] font-semibold text-subtle">{label}</span>}
            <input
              ref={inputRef}
              type="text"
              className="paper-input w-full"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className={tone === 'danger' ? 'primary bg-secondary hover:bg-secondary-dark' : 'primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
