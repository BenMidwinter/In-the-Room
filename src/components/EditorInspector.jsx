import FormOverlay from './FormOverlay'

/**
 * Phone-only details sheet for a writing view.
 * Render it only from usePhoneLayout(), so the desktop editor never mounts it.
 */
export default function EditorInspector({ open, title = 'Details', onClose, children }) {
  if (!open) return null
  return (
    <FormOverlay title={title} onClose={onClose} size="sheet">
      {children}
    </FormOverlay>
  )
}
