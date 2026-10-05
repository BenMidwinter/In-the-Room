export const THEME_GROUPS = [
  {
    id: 'practice',
    label: 'Practice',
    note: '',
    themes: [
      { id: 'practice', label: 'Practice linen', hint: 'Warm canvas, forest accent' },
    ],
  },
  {
    id: 'reading',
    label: 'Reading',
    note: 'High contrast replaces the colours.',
    themes: [
      { id: 'reading-contrast', label: 'High contrast', hint: 'Black on white, heavier borders, underlined links' },
    ],
  },
  {
    id: 'somatic',
    label: 'Somatic themes',
    note: 'Mood colours.',
    themes: [
      { id: 'somatic-grounded', label: 'Grounded', hint: 'Moss & soft green calm' },
      { id: 'somatic-activated', label: 'Activated', hint: 'Clay warmth & kinetic focus' },
      { id: 'somatic-fatigued', label: 'Fatigued', hint: 'Slate & quiet ash' },
      { id: 'somatic-open', label: 'Open', hint: 'Deep blue sky openness' },
      { id: 'somatic-constricted', label: 'Constricted', hint: 'Plum & held indigo' },
      { id: 'somatic-settled', label: 'Settled', hint: 'Graphite on white' },
    ],
  },
]

export const THEMES = THEME_GROUPS.flatMap(g => g.themes)

export const EXPRESSIVE_THEME_IDS: string[] = []

export const SOMATIC_THEME_IDS = [
  'somatic-grounded',
  'somatic-activated',
  'somatic-fatigued',
  'somatic-open',
  'somatic-constricted',
  'somatic-settled',
]

export const DEFAULT_THEME_ID = 'practice'

const STORAGE_KEY = 'in-the-room-theme'
const READING_KEY = 'in-the-room-reading'

export type ReadingPrefs = {
  strongerText: boolean
  plainType: boolean
}

export const EXPRESSIVE_ACCENT_VARS: string[] = []

export function isValidThemeId(id: string | null | undefined) {
  return THEMES.some(t => t.id === id)
}

export function isExpressiveTheme(_themeId?: string) {
  return false
}

export function isSomaticTheme(themeId: string) {
  return SOMATIC_THEME_IDS.includes(themeId)
}

export function getThemeGroupId(themeId: string) {
  const group = THEME_GROUPS.find(g => g.themes.some(t => t.id === themeId))
  return group?.id ?? 'practice'
}

export function clearExpressiveAccent() {
  /* Colour wheel accents removed. */
}

export function applyExpressiveAccent(_hue?: number, _baseThemeId?: string) {
  /* no-op — expressive themes removed */
}

export function getStoredExpressiveHue() {
  return null
}

export function resolveThemeId(
  saved: string | null,
  legacySomatic: string | null,
  prefersContrast: boolean,
) {
  if (isValidThemeId(saved)) return saved as string
  if (saved) return DEFAULT_THEME_ID
  if (legacySomatic && legacySomatic !== 'none') {
    const migrated = `somatic-${legacySomatic}`
    if (isValidThemeId(migrated)) return migrated
  }
  if (prefersContrast) return 'reading-contrast'
  return DEFAULT_THEME_ID
}

export function applyTheme(themeId: string, options?: { persist?: boolean }) {
  const next = isValidThemeId(themeId) ? themeId : DEFAULT_THEME_ID
  document.documentElement.setAttribute('data-theme', next)
  document.documentElement.removeAttribute('data-somatic-scheme')
  if (options?.persist !== false) {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }
  return next
}

function prefersMoreContrast() {
  try {
    return window.matchMedia('(prefers-contrast: more)').matches
  } catch {
    return false
  }
}

export function getStoredThemeId() {
  try {
    return resolveThemeId(
      localStorage.getItem(STORAGE_KEY),
      localStorage.getItem('in-the-room-somatic-scheme'),
      prefersMoreContrast(),
    )
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function getStoredReading(): ReadingPrefs {
  try {
    const raw = localStorage.getItem(READING_KEY)
    if (!raw) return { strongerText: false, plainType: false }
    const parsed = JSON.parse(raw) as Partial<ReadingPrefs>
    return {
      strongerText: Boolean(parsed.strongerText),
      plainType: Boolean(parsed.plainType),
    }
  } catch {
    return { strongerText: false, plainType: false }
  }
}

export function applyReading(prefs: ReadingPrefs) {
  const root = document.documentElement
  if (prefs.strongerText) root.setAttribute('data-stronger-text', 'on')
  else root.removeAttribute('data-stronger-text')
  if (prefs.plainType) root.setAttribute('data-plain-type', 'on')
  else root.removeAttribute('data-plain-type')
  try {
    localStorage.setItem(READING_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
  return prefs
}

export function initTheme() {
  applyReading(getStoredReading())
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null
  }
  const next = getStoredThemeId()
  return applyTheme(next, { persist: isValidThemeId(saved) })
}

export function cycleTheme(currentId: string) {
  const idx = THEMES.findIndex(t => t.id === currentId)
  const next = THEMES[(idx + 1) % THEMES.length]
  return applyTheme(next.id)
}
