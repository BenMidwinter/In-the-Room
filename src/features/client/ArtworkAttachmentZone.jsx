import { useRef, useState } from 'react'

function uid() {
  return `art-${crypto.randomUUID()}`
}

export default function ArtworkAttachmentZone({ attachments = [], onChange, disabled = false }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const addFiles = (fileList) => {
    if (!fileList?.length || disabled) return
    const added = [...fileList].map(file => ({
      id: uid(),
      name: file.name,
      uploaded_at: new Date().toISOString().split('T')[0],
      preview_type: file.type.startsWith('image/') ? 'image' : 'file',
    }))
    onChange?.([...attachments, ...added])
  }

  const removeAttachment = (id) => {
    onChange?.(attachments.filter(a => a.id !== id))
  }

  return (
    <div className="artwork-zone">
      <div className="artwork-zone__header">
        <label className="artwork-zone__label">Client artwork / creations</label>
        <span className="text-small text-muted">Photos attach to this note</span>
      </div>

      <div
        className={`artwork-zone__drop${dragOver ? ' artwork-zone__drop--active' : ''}${disabled ? ' artwork-zone__drop--disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          addFiles(e.dataTransfer.files)
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="artwork-zone__input"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
          disabled={disabled}
        />
        <span className="artwork-zone__icon" aria-hidden>🖼</span>
        <p className="artwork-zone__prompt">Drop artwork photos here or click to browse</p>
        <p className="artwork-zone__hint text-small text-muted">Mock upload — files are stored in session state only</p>
      </div>

      {attachments.length > 0 && (
        <ul className="artwork-zone__list">
          {attachments.map(file => (
            <li key={file.id} className="artwork-zone__file">
              <span className="artwork-zone__file-icon" aria-hidden>📎</span>
              <span className="artwork-zone__file-name">{file.name}</span>
              {!disabled && (
                <button
                  type="button"
                  className="artwork-zone__remove"
                  onClick={(e) => { e.stopPropagation(); removeAttachment(file.id) }}
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
