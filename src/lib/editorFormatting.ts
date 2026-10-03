/** Standard web-safe font stacks for the rich text editor. */
export const EDITOR_FONTS = [
  { id: 'karla', label: 'Karla', css: "'Karla', system-ui, sans-serif" },
  { id: 'system', label: 'System UI', css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: 'georgia', label: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  { id: 'times', label: 'Times', css: "'Times New Roman', Times, serif" },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { id: 'courier', label: 'Courier', css: "'Courier New', Courier, monospace" },
]

/** Standard body text sizes (editor toolbar). */
export const EDITOR_TEXT_SIZES = [
  { id: 'small', label: 'Small', className: 'doc-size--small' },
  { id: 'normal', label: 'Normal', className: 'doc-size--normal' },
  { id: 'large', label: 'Large', className: 'doc-size--large' },
  { id: 'xlarge', label: 'Extra large', className: 'doc-size--xlarge' },
]

/** Expressive display sizes (slash + expressive panel). */
export const EXPRESSIVE_SIZES = [
  { id: 'standard', label: 'Standard', className: 'expr-size--standard' },
  { id: 'loud', label: 'Loud', className: 'expr-size--loud' },
  { id: 'bold-bright', label: 'Bold & Bright', className: 'expr-size--bold-bright' },
  { id: 'fluid', label: 'Fluid Narrative', className: 'expr-size--fluid' },
]

export const EDITOR_TEXT_COLORS = [
  { id: 'default', label: 'Default', hex: null, className: '' },
  { id: 'charcoal', label: 'Charcoal', hex: '#2d3439', className: 'doc-color--charcoal' },
  { id: 'teal', label: 'Teal', hex: '#3a9fbf', className: 'doc-color--teal' },
  { id: 'violet', label: 'Violet', hex: '#7a6ec4', className: 'doc-color--violet' },
  { id: 'clay', label: 'Clay', hex: '#c67b5c', className: 'doc-color--clay' },
  { id: 'sage', label: 'Sage', hex: '#6b7a5e', className: 'doc-color--sage' },
  { id: 'coral', label: 'Coral', hex: '#e07a5f', className: 'doc-color--coral' },
  { id: 'navy', label: 'Navy', hex: '#1a3a5c', className: 'doc-color--navy' },
  { id: 'magenta', label: 'Magenta', hex: '#d926b8', className: 'doc-color--magenta' },
  { id: 'lime', label: 'Lime', hex: '#5a8f00', className: 'doc-color--lime' },
]

export const EDITOR_HIGHLIGHTS = [
  { id: 'none', label: 'None', className: '', isClear: true },
  { id: 'teal-wash', label: 'Teal wash', className: 'expr-hl--teal-wash' },
  { id: 'violet-wash', label: 'Violet wash', className: 'expr-hl--violet-wash' },
  { id: 'clay-wash', label: 'Clay wash', className: 'expr-hl--clay-wash' },
  { id: 'sage-wash', label: 'Sage wash', className: 'expr-hl--sage-wash' },
  { id: 'yellow-soft', label: 'Soft yellow', className: 'expr-hl--yellow-soft' },
  { id: 'pink-soft', label: 'Soft pink', className: 'expr-hl--pink-soft' },
  { id: 'neon-lime', label: 'Neon lime', className: 'expr-hl--neon-lime' },
  { id: 'neon-magenta', label: 'Neon magenta', className: 'expr-hl--neon-magenta' },
]

export const SLASH_COMMANDS = [
  { id: 'dapnotes', label: 'DAP notes', group: 'Clinical sections', action: 'insertSnippet', value: 'dapnotes' },
  { id: 'consent', label: 'Consent record', group: 'Clinical sections', action: 'insertSnippet', value: 'consent' },
  { id: 'size-large', label: 'Large text', group: 'Size', action: 'textSize', value: 'large' },
  { id: 'size-loud', label: 'Loud text', group: 'Expressive size', action: 'size', value: 'loud' },
  { id: 'size-bold', label: 'Bold & Bright', group: 'Expressive size', action: 'size', value: 'bold-bright' },
  { id: 'color-teal', label: 'Teal text', group: 'Text colour', action: 'textColor', value: 'teal' },
  { id: 'color-violet', label: 'Violet text', group: 'Text colour', action: 'textColor', value: 'violet' },
  { id: 'hl-teal', label: 'Teal highlight', group: 'Highlight', action: 'highlight', value: 'teal-wash' },
  { id: 'hl-violet', label: 'Violet highlight', group: 'Highlight', action: 'highlight', value: 'violet-wash' },
  { id: 'hl-neon', label: 'Neon lime glow', group: 'Highlight', action: 'highlight', value: 'neon-lime' },
  { id: 'audio', label: 'Audio fragment', group: 'Media', action: 'audio' },
  { id: 'artwork', label: 'Inline artwork', group: 'Media', action: 'artwork' },
  { id: 'h1', label: 'Large title', group: 'Structure', action: 'heading', value: 1 },
  { id: 'h2', label: 'Section heading', group: 'Structure', action: 'heading', value: 2 },
  { id: 'divider', label: 'Divider line', group: 'Structure', action: 'divider' },
]

/** HTML snippets inserted by clinical slash commands (section-level, not full templates). */
export const SLASH_SNIPPETS = {
  dapnotes: `<h2>DAP notes</h2>
<p><strong>Data</strong> — objective observations from the session:</p>
<p></p>
<p><strong>Assessment</strong> — clinical interpretation and formulation:</p>
<p></p>
<p><strong>Plan</strong> — next steps, goals, and follow-up:</p>
<p></p>`,
  consent: `<h2>Consent</h2>
<p><strong>Discussion held with:</strong> </p>
<p><strong>Date:</strong> </p>
<p><strong>Capacity considered:</strong> </p>
<ul>
<li>Purpose of intervention explained</li>
<li>Benefits and possible limitations discussed</li>
<li>Confidentiality and information-sharing boundaries explained</li>
<li>Right to withdraw consent explained</li>
</ul>
<p><strong>Consent outcome:</strong> </p>
<p><strong>Clinician notes:</strong> </p>
<p></p>`,
}

export function filterSlashCommands(query) {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(cmd =>
    cmd.id.toLowerCase().includes(q)
    || cmd.label.toLowerCase().includes(q)
    || cmd.group.toLowerCase().includes(q),
  )
}

export function getSlashSnippet(id) {
  return SLASH_SNIPPETS[id] || ''
}

export function fontCssForId(id) {
  return EDITOR_FONTS.find(f => f.id === id)?.css || EDITOR_FONTS[0].css
}

export function textColorHexForId(id) {
  return EDITOR_TEXT_COLORS.find(c => c.id === id)?.hex || null
}
