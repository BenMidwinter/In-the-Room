export const THEME_GROUPS = [
  {
    id: 'clinical',
    label: 'Clinical Themes',
    themes: [
      { id: 'light-clinical', label: 'Light Clinical', hint: 'Logo blue, red & charcoal' },
      { id: 'dark-studio', label: 'Dark Studio', hint: 'Charcoal studio with red highlights' },
      { id: 'muted-somatic', label: 'Muted Somatic', hint: 'Linen, clay & sage' },
    ],
  },
  {
    id: 'expressive',
    label: 'Expressive Themes',
    themes: [
      { id: 'vibrant-expressive', label: 'Vibrant Expressive', hint: 'Bold gradients & neon app-wide' },
      { id: 'neon-signal', label: 'Neon Signal', hint: 'Electric cyan & lime on deep ink' },
    ],
  },
  {
    id: 'somatic',
    label: 'Somatic Themes',
    themes: [
      { id: 'somatic-grounded', label: 'Grounded', hint: 'Ventral moss & raw terracotta' },
      { id: 'somatic-activated', label: 'Activated', hint: 'Cadmium crimson kinetic release' },
      { id: 'somatic-fatigued', label: 'Fatigued', hint: 'Slate charcoal & fluid ash' },
      { id: 'somatic-open', label: 'Open', hint: 'Cobalt sky & luminous cerulean' },
      { id: 'somatic-constricted', label: 'Constricted', hint: 'Bruised plum & heavy indigo' },
      { id: 'somatic-settled', label: 'Settled', hint: 'Linen alabaster & graphite' },
    ],
  },
]

export const THEMES = THEME_GROUPS.flatMap(g => g.themes)

export const EXPRESSIVE_THEME_IDS = ['vibrant-expressive', 'neon-signal']

export const SOMATIC_THEME_IDS = [
  'somatic-grounded',
  'somatic-activated',
  'somatic-fatigued',
  'somatic-open',
  'somatic-constricted',
  'somatic-settled',
]

export const DEFAULT_THEME_ID = 'light-clinical'

const STORAGE_KEY = 'in-the-room-theme'
const HUE_STORAGE_KEY = 'in-the-room-expressive-hue'

/** CSS vars the colour wheel may override on expressive themes. */
export const EXPRESSIVE_ACCENT_VARS = [
  '--col-primary',
  '--col-primary-dark',
  '--col-primary-light',
  '--col-accent',
  '--col-accent-dark',
  '--bg-page',
  '--bg-surface',
  '--bg-zone-muted',
  '--bg-zone-accent',
  '--border-color',
  '--border-light',
  '--txt-muted',
  '--expr-gradient-a',
  '--expr-gradient-b',
  '--badge-accent',
  '--highlight-soft',
  '--highlight-glow',
]

export function isValidThemeId(id) {
  return THEMES.some(t => t.id === id)
}

export function isExpressiveTheme(themeId) {
  return EXPRESSIVE_THEME_IDS.includes(themeId)
}

export function isSomaticTheme(themeId) {
  return SOMATIC_THEME_IDS.includes(themeId)
}

export function getThemeGroupId(themeId) {
  const group = THEME_GROUPS.find(g => g.themes.some(t => t.id === themeId))
  return group?.id ?? 'clinical'
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h)} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)`
}

/**
 * Build an expressive palette from a wheel hue using split-complementary colour theory.
 * Primary = selected hue; accent text = deep split-complement; highlights = analogous + triad.
 */
export function paletteFromHue(hue, baseThemeId = 'vibrant-expressive') {
  const h = ((hue % 360) + 360) % 360
  const splitA = (h + 150) % 360
  const splitB = (h + 210) % 360
  const triad = (h + 120) % 360
  const isNeonSignal = baseThemeId === 'neon-signal'

  const primary = hsl(h, isNeonSignal ? 92 : 85, isNeonSignal ? 58 : 55)
  const primaryDark = hsl(h, 80, isNeonSignal ? 45 : 42)
  const primaryLight = hsl(h, 70, isNeonSignal ? 22 : 92)

  const accent = hsl(splitA, isNeonSignal ? 35 : 28, isNeonSignal ? 12 : 16)
  const accentDark = hsl(splitA, 40, isNeonSignal ? 8 : 10)

  const pageBg = isNeonSignal
    ? hsl(splitA, 45, 8)
    : hsl(h, 55, 97)
  const surface = isNeonSignal ? hsl(splitA, 40, 11) : '#ffffff'
  const zoneMuted = isNeonSignal ? hsl(splitA, 35, 14) : hsl(h, 60, 94)
  const border = isNeonSignal ? hsl(h, 50, 28) : hsl(h, 45, 82)
  const borderLight = isNeonSignal ? hsl(h, 40, 22) : hsl(h, 50, 90)
  const txtMuted = isNeonSignal ? hsl(h, 35, 68) : hsl(splitA, 25, 42)

  const gradientA = `linear-gradient(120deg, ${hsl(h, 90, 58)} 0%, ${hsl(triad, 85, 55)} 50%, ${hsl(splitB, 88, 62)} 100%)`
  const gradientB = `linear-gradient(120deg, ${hsl(splitA, 80, 52)} 0%, ${hsl(h, 90, 55)} 100%)`
  const highlightSoft = `linear-gradient(120deg, color-mix(in srgb, ${hsl(h, 80, 75)} 25%, transparent) 0%, color-mix(in srgb, ${hsl(triad, 75, 70)} 40%, transparent) 100%)`
  const highlightGlow = hsl(triad, 90, 62)

  return {
    '--col-primary': primary,
    '--col-primary-dark': primaryDark,
    '--col-primary-light': isNeonSignal ? `${primary}33` : primaryLight,
    '--col-accent': isNeonSignal ? hsl(h, 30, 92) : accent,
    '--col-accent-dark': isNeonSignal ? '#ffffff' : accentDark,
    '--bg-page': pageBg,
    '--bg-surface': surface,
    '--bg-zone-muted': zoneMuted,
    '--bg-zone-accent': isNeonSignal
      ? `linear-gradient(135deg, ${hsl(h, 50, 14)} 0%, ${hsl(triad, 45, 16)} 100%)`
      : `linear-gradient(135deg, ${hsl(h, 70, 94)} 0%, ${hsl(triad, 65, 92)} 100%)`,
    '--border-color': border,
    '--border-light': borderLight,
    '--txt-muted': txtMuted,
    '--expr-gradient-a': gradientA,
    '--expr-gradient-b': gradientB,
    '--badge-accent': hsl(triad, 85, 50),
    '--highlight-soft': highlightSoft,
    '--highlight-glow': highlightGlow,
  }
}

export function clearExpressiveAccent() {
  const root = document.documentElement
  EXPRESSIVE_ACCENT_VARS.forEach(v => root.style.removeProperty(v))
}

export function applyExpressiveAccent(hue, baseThemeId) {
  const themeId = baseThemeId || getStoredThemeId()
  if (!isExpressiveTheme(themeId)) return
  const palette = paletteFromHue(hue, themeId)
  const root = document.documentElement
  Object.entries(palette).forEach(([key, value]) => root.style.setProperty(key, value))
  try {
    localStorage.setItem(HUE_STORAGE_KEY, String(Math.round(hue)))
  } catch {
    /* ignore */
  }
}

export function getStoredExpressiveHue() {
  try {
    const saved = localStorage.getItem(HUE_STORAGE_KEY)
    if (saved == null) return null
    const n = Number(saved)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function applyTheme(themeId) {
  const next = isValidThemeId(themeId) ? themeId : DEFAULT_THEME_ID
  document.documentElement.setAttribute('data-theme', next)
  document.documentElement.removeAttribute('data-somatic-scheme')
  clearExpressiveAccent()
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  if (isExpressiveTheme(next)) {
    const hue = getStoredExpressiveHue()
    if (hue != null) applyExpressiveAccent(hue, next)
  }
  return next
}

export function getStoredThemeId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isValidThemeId(saved)) return saved
    // Migrate legacy somatic overlay selection to full themes
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

export function cycleTheme(currentId) {
  const idx = THEMES.findIndex(t => t.id === currentId)
  const next = THEMES[(idx + 1) % THEMES.length]
  return applyTheme(next.id)
}
