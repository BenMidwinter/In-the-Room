import { useRef, useState } from 'react'
import { downloadClientFile, uploadClientFile } from '../../lib/supabase/clientFilesRepo'

export default function ArtworkAttachmentZone({
  clientId,
  attachments = [],
  onChange,
  disabled = false,
  compact = false,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const addFiles = async (fileList) => {
    const chosen = [...(fileList || [])]
    if (!chosen.length || disabled || busy) return
    if (!clientId) {
      setError('Open a client before attaching artwork.')
      return
    }
    setBusy(true)
    setError('')
    const next = [...attachments]
    try {
      for (const file of chosen) {
        if (!file.type.startsWith('image/')) throw new Error('Artwork must be an image.')
        const row = await uploadClientFile(clientId, file)
        next.push({
          id: row.id,
          name: row.file_name,
          uploaded_at: row.created_at.slice(0, 10),
          preview_type: 'image',
          file_type: row.file_type,
          file_size_bytes: row.file_size_bytes,
          s3_key: row.s3_key,
        })
      }
      onChange?.(next)
    } catch (err) {
      setError(err?.message || 'The artwork could not be stored.')
      if (next.length !== attachments.length) onChange?.(next)
    } finally {
      setBusy(false)
    }
  }

  const removeAttachment = (id) => {
    onChange?.(attachments.filter((item) => item.id !== id))
  }

  const openPicker = () => {
    if (!disabled && !busy) inputRef.current?.click()
  }

  const dropBindings = {
    onDragOver: (event) => {
      event.preventDefault()
      if (!disabled && !busy) setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event) => {
      event.preventDefault()
      setDragOver(false)
      addFiles(event.dataTransfer.files)
    },
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="artwork-zone__input"
      onChange={(event) => {
        addFiles(event.target.files)
        event.target.value = ''
      }}
      disabled={disabled || busy}
    />
  )

  const fileList = attachments.length > 0 && (
    <ul className="artwork-zone__list">
      {attachments.map((file) => (
        <li key={file.id} className="artwork-zone__file">
          <span className="artwork-zone__file-icon" aria-hidden>📎</span>
          {file.s3_key ? (
            <button
              type="button"
              className="artwork-zone__file-name auth-page__link"
              onClick={() => downloadClientFile(file.id).catch((err) => setError(err?.message || 'The artwork could not be downloaded.'))}
            >
              {file.name}
            </button>
          ) : (
            <span className="artwork-zone__file-name">{file.name}</span>
          )}
          {!disabled && (
            <button
              type="button"
              className="artwork-zone__remove"
              onClick={(event) => { event.stopPropagation(); removeAttachment(file.id) }}
              aria-label={`Remove ${file.name}`}
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  )

  if (compact) {
    return (
      <div className="artwork-zone artwork-zone--bar">
        <span className="artwork-zone__label">Artwork</span>
        <div
          className={`artwork-zone__bar-row${dragOver ? ' artwork-zone__bar-row--active' : ''}${disabled || busy ? ' artwork-zone__bar-row--disabled' : ''}`}
          {...dropBindings}
        >
          {fileInput}
          <button
            type="button"
            className="artwork-zone__pick"
            onClick={openPicker}
            disabled={disabled || busy}
          >
            {busy ? 'Storing…' : 'Drop art'}
          </button>
          {fileList}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className="artwork-zone">
      <div className="artwork-zone__header">
        <label className="artwork-zone__label">Client artwork / creations</label>
        <span className="text-small text-muted">Photos attach to this note</span>
      </div>

      <div
        className={`artwork-zone__drop${dragOver ? ' artwork-zone__drop--active' : ''}${disabled || busy ? ' artwork-zone__drop--disabled' : ''}`}
        {...dropBindings}
        onClick={openPicker}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !disabled && !busy) {
            event.preventDefault()
            openPicker()
          }
        }}
      >
        {fileInput}
        <span className="artwork-zone__icon" aria-hidden>🖼</span>
        <p className="artwork-zone__prompt">
          {busy ? 'Storing artwork…' : 'Drop artwork photos here or click to browse'}
        </p>
        <p className="artwork-zone__hint text-small text-muted">
          Images are stored privately with this client&apos;s files.
        </p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {fileList}
    </div>
  )
}
