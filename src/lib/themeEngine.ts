export const THEME_GROUPS = [
  {
    id: 'practice',
    label: 'Practice',
    themes: [
      { id: 'practice', label: 'Practice linen', hint: 'Warm canvas, forest accent' },
    ],
  },
  {
    id: 'somatic',
    label: 'Somatic Themes',
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

export function applyTheme(themeId: string) {
  const next = isValidThemeId(themeId) ? themeId : DEFAULT_THEME_ID
  document.documentElement.setAttribute('data-theme', next)
  document.documentElement.removeAttribute('data-somatic-scheme')
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

export function getStoredThemeId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isValidThemeId(saved)) return saved as string
    // Migrate retired themes to practice linen
    if (
      saved === 'light-clinical'
      || saved === 'light-chroma'
      || saved === 'dark-studio'
      || saved === 'muted-somatic'
      || saved === 'vibrant-expressive'
      || saved === 'neon-signal'
    ) {
      return DEFAULT_THEME_ID
    }
    const legacySomatic = localStorage.getItem('in-the-room-somatic-scheme')
    if (legacySomatic && legacySomatic !== 'none') {
      const migrated = `somatic-${legacySomatic}`
      if (isValidThemeId(migrated)) return migrated
    }
    return DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function initTheme() {
  return applyTheme(getStoredThemeId())
}

export function cycleTheme(currentId: string) {
  const idx = THEMES.findIndex(t => t.id === currentId)
  const next = THEMES[(idx + 1) % THEMES.length]
  return applyTheme(next.id)
}
