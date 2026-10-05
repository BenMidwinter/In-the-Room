import { useEffect, useRef, useState } from 'react'
import {
  THEME_GROUPS,
  applyReading,
  applyTheme,
  getStoredReading,
  getStoredThemeId,
  getThemeGroupId,
} from '../lib/themeEngine'

function PaintbrushIcon() {
  return (
    <svg className="top-nav__utility-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M7 21c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v1H7v-1zm8.7-12.3l1.6 1.6-8.4 8.4-2.3.5.5-2.3 8.6-8.2zm1.4-1.4l1.4 1.4c.4.4.4 1 0 1.4l-1.1 1.1-2.8-2.8 1.1-1.1c.4-.4 1-.4 1.4 0z"
      />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`theme-toggle__accordion-chevron${open ? ' theme-toggle__accordion-chevron--open' : ''}`}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      focusable="false"
    >
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M4 6l4 4 4-4" />
    </svg>
  )
}

export default function ThemeToggle() {
  const [themeId, setThemeId] = useState(getStoredThemeId)
  const [reading, setReading] = useState(getStoredReading)
  const [open, setOpen] = useState(false)
  const [expandedGroupId, setExpandedGroupId] = useState(() => getThemeGroupId(getStoredThemeId()))
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const pickTheme = (id) => {
    const applied = applyTheme(id)
    setThemeId(applied)
    setExpandedGroupId(getThemeGroupId(applied))
  }

  const setReadingPref = (key, value) => {
    const next = applyReading({ ...reading, [key]: value })
    setReading(next)
  }

  const toggleMenu = () => {
    setOpen(prev => {
      const next = !prev
      if (next) setExpandedGroupId(getThemeGroupId(themeId))
      return next
    })
  }

  const toggleGroup = (groupId) => {
    setExpandedGroupId(prev => (prev === groupId ? null : groupId))
  }

  const active = THEME_GROUPS.flatMap(g => g.themes).find(t => t.id === themeId)

  return (
    <div className="theme-toggle" ref={rootRef}>
      <button
        type="button"
        className="top-nav__utility-btn theme-toggle__trigger"
        onClick={toggleMenu}
        aria-label={`App theme: ${active?.label || 'Practice linen'}`}
        aria-expanded={open}
        title={`App theme: ${active?.label || 'Practice linen'}`}
      >
        <PaintbrushIcon />
      </button>
      {open && (
        <div className="theme-toggle__menu" role="menu">
          <p className="theme-toggle__menu-title">App-wide theme</p>
          {THEME_GROUPS.map(group => {
            const isExpanded = expandedGroupId === group.id
            const activeInGroup = group.themes.find(t => t.id === themeId)
            return (
              <div key={group.id} className="theme-toggle__accordion">
                <button
                  type="button"
                  className="theme-toggle__accordion-trigger"
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="theme-toggle__accordion-label">{group.label}</span>
                  <span className="theme-toggle__accordion-meta">
                    {activeInGroup?.label}
                    <ChevronIcon open={isExpanded} />
                  </span>
                </button>
                {isExpanded && (
                  <ul className="theme-toggle__list theme-toggle__accordion-panel">
                    {group.note ? <li className="theme-toggle__group-note">{group.note}</li> : null}
                    {group.themes.map(theme => (
                      <li key={theme.id}>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={themeId === theme.id}
                          className={`theme-toggle__option${themeId === theme.id ? ' theme-toggle__option--active' : ''}`}
                          data-theme-preview={theme.id}
                          onClick={() => pickTheme(theme.id)}
                        >
                          <span className="theme-toggle__option-label">{theme.label}</span>
                          <span className="theme-toggle__option-hint">{theme.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <div className="theme-toggle__reading">
            <p className="theme-toggle__menu-title">Keep this theme</p>
            <label className="theme-toggle__switch">
              <input
                type="checkbox"
                checked={reading.strongerText}
                onChange={(event) => setReadingPref('strongerText', event.target.checked)}
              />
              <span>
                <span className="theme-toggle__option-label">Stronger text</span>
                <span className="theme-toggle__option-hint">Darker hints, labels, and borders</span>
              </span>
            </label>
            <label className="theme-toggle__switch">
              <input
                type="checkbox"
                checked={reading.plainType}
                onChange={(event) => setReadingPref('plainType', event.target.checked)}
              />
              <span>
                <span className="theme-toggle__option-label">Plain type</span>
                <span className="theme-toggle__option-hint">Atkinson Hyperlegible, with wider line spacing</span>
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
