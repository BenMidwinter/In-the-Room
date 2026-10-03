import { useState } from 'react'
import { parseCommaTags, joinCommaTags } from '../lib/commaTags'

/**
 * Comma-delimited tag input — type tags separated by commas or press Enter.
 * Value is stored as a single comma-delimited string.
 */
export default function CommaTagInput({
  id,
  value = '',
  onChange,
  placeholder = 'Add items separated by commas…',
  className = '',
}) {
  const tags = parseCommaTags(value)
  const [draft, setDraft] = useState('')

  const commitDraft = () => {
    const next = draft.trim()
    if (!next) return
    const additions = parseCommaTags(next)
    if (!additions.length) return
    const merged = [...tags]
    for (const tag of additions) {
      if (!merged.some(t => t.toLowerCase() === tag.toLowerCase())) {
        merged.push(tag)
      }
    }
    onChange(joinCommaTags(merged))
    setDraft('')
  }

  const removeTag = (tag) => {
    onChange(joinCommaTags(tags.filter(t => t !== tag)))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  const handleBlur = () => {
    commitDraft()
  }

  return (
    <div className={`comma-tag-input ${className}`.trim()}>
      <div className="comma-tag-input__field">
        {tags.map(tag => (
          <span key={tag} className="comma-tag-input__tag">
            {tag}
            <button
              type="button"
              className="comma-tag-input__remove"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          className="comma-tag-input__text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? placeholder : 'Add another…'}
        />
      </div>
      <p className="comma-tag-input__hint text-small text-muted">
        Separate each item with a comma, or press Enter after typing.
      </p>
    </div>
  )
}

export { parseCommaTags, joinCommaTags } from '../lib/commaTags'
