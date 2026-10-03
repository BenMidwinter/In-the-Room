import { useState } from 'react'

export function hasMeaningfulEditorContent(html) {
  if (!html) return false
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text.length > 0
}

export default function TemplatePicker({
  templates,
  onApply,
  label = 'Template',
  emptyLabel = 'Choose a template…',
  applyLabel = 'Apply',
}) {
  const [selectedId, setSelectedId] = useState('')

  if (!templates.length) return null

  const handleApply = () => {
    const template = templates.find(t => t.id === selectedId)
    if (!template) return
    onApply(template)
    setSelectedId('')
  }

  return (
    <div className="template-picker">
      <label className="template-picker__label">{label}</label>
      <select
        className="paper-input template-picker__select"
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        aria-label={label}
      >
        <option value="">{emptyLabel}</option>
        {templates.map(template => (
          <option key={template.id} value={template.id} title={template.description || undefined}>
            {template.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="secondary template-picker__apply"
        disabled={!selectedId}
        onClick={handleApply}
      >
        {applyLabel}
      </button>
    </div>
  )
}
