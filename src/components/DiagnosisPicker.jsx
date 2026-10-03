import { useState, useEffect, useRef } from 'react'

const PRESET_OPTIONS = [
  'ADHD',
  'Anxiety',
  'Attachment Disorder',
  'Autism Spectrum Condition (ASC)',
  'Global Developmental Delay',
  'Obsessive Compulsive Disorder (OCD)',
  'Oppositional Defiant Disorder (ODD)',
  'PDA Profile',
  'PMLD',
  'Social, Emotional and Mental Health (SEMH)',
  'Speech, Language and Communication Needs (SLCN)',
  'Trauma / ACEs',
].sort()

export default function DiagnosisPicker({ selected = [], onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleSelection = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option))
    } else {
      onChange([...selected, option])
    }
    setFilter('')
  }

  const handleCustomAdd = () => {
    if (filter.trim()) {
      toggleSelection(filter.trim())
    }
  }

  const filteredOptions = PRESET_OPTIONS.filter(opt =>
    opt.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div className="diagnosis-picker" ref={wrapperRef}>
      <div className="diagnosis-picker__field" onClick={() => setIsOpen(true)} role="presentation">
        {selected.map(tag => (
          <span key={tag} className="diagnosis-picker__tag">
            {tag}
            <button
              type="button"
              className="diagnosis-picker__remove"
              onClick={(e) => { e.stopPropagation(); toggleSelection(tag) }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="diagnosis-picker__input"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setIsOpen(true) }}
          placeholder={selected.length === 0 ? 'Select or type diagnosis…' : ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCustomAdd()
            }
          }}
        />
      </div>

      {isOpen && (
        <div className="diagnosis-picker__menu">
          {filteredOptions.map(opt => (
            <button
              key={opt}
              type="button"
              className={`diagnosis-picker__option${selected.includes(opt) ? ' diagnosis-picker__option--selected' : ''}`}
              onClick={() => toggleSelection(opt)}
            >
              {selected.includes(opt) ? '✓ ' : ''}{opt}
            </button>
          ))}

          {filter && !filteredOptions.includes(filter) && !selected.includes(filter) && (
            <button type="button" className="diagnosis-picker__add-custom" onClick={handleCustomAdd}>
              + Add &ldquo;{filter}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
