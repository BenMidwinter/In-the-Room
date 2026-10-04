import { MERGE_FIELD_OPTIONS } from './mergeFields'

/** Faces the editor can apply. Body defaults to Karla; headings default to Fraunces. */
export const EDITOR_FONTS = [
  { id: 'karla', label: 'Karla', css: "'Karla', system-ui, sans-serif" },
  { id: 'fraunces', label: 'Fraunces', css: "'Fraunces', Georgia, serif" },
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

/**
 * Ways of writing inside a process note.
 * These are voices, not poster sizes: a phrase can sound like the client,
 * sit back as an aside, or land in the heading face.
 */
export const WRITING_VOICES = [
  { id: 'voice', label: 'Their words', hint: 'Fraunces italic, as something said', className: 'expr-size--voice' },
  { id: 'aside', label: 'Aside', hint: 'Quieter, for a reflection', className: 'expr-size--aside' },
  { id: 'land', label: 'Landing line', hint: 'A phrase in the heading face', className: 'expr-size--land' },
]

/**
 * Palette colours sit with the somatic language of the practice:
 * settled breath, grounded green, warmth, open air, pulse.
 * Older ids stay so saved notes still resolve a colour.
 */
export const EDITOR_TEXT_COLORS = [
  { id: 'default', label: 'Default', hex: null, className: '' },
  { id: 'settled', label: 'Settled', hex: '#2a7a68', className: 'doc-color--settled' },
  { id: 'grounded', label: 'Grounded', hex: '#3f7a4e', className: 'doc-color--grounded' },
  { id: 'warmth', label: 'Warmth', hex: '#c4624e', className: 'doc-color--warmth' },
  { id: 'open', label: 'Open', hex: '#3e6ea5', className: 'doc-color--open' },
  { id: 'pulse', label: 'Pulse', hex: '#c45b78', className: 'doc-color--pulse' },
  { id: 'charcoal', label: 'Charcoal', hex: '#2d3439', className: 'doc-color--charcoal' },
  { id: 'teal', label: 'Teal', hex: '#3a6f62', className: 'doc-color--teal' },
  { id: 'clay', label: 'Clay', hex: '#8d5340', className: 'doc-color--clay' },
  { id: 'sage', label: 'Sage', hex: '#4f6248', className: 'doc-color--sage' },
  { id: 'navy', label: 'Navy', hex: '#1a3a5c', className: 'doc-color--navy' },
  { id: 'violet', label: 'Violet', hex: '#7a6ec4', className: 'doc-color--violet' },
  { id: 'coral', label: 'Coral', hex: '#e07a5f', className: 'doc-color--coral' },
  { id: 'magenta', label: 'Magenta', hex: '#d926b8', className: 'doc-color--magenta' },
  { id: 'lime', label: 'Lime', hex: '#5a8f00', className: 'doc-color--lime' },
]

export const EDITOR_COLOR_CHOICES = ['default', 'settled', 'grounded', 'warmth', 'open', 'pulse']

export const EDITOR_HIGHLIGHTS = [
  { id: 'none', label: 'None', className: '', isClear: true },
  { id: 'yellow-soft', label: 'Return to this', className: 'expr-hl--yellow-soft' },
  { id: 'sage-wash', label: 'Observation', className: 'expr-hl--sage-wash' },
  { id: 'clay-wash', label: 'Feeling', className: 'expr-hl--clay-wash' },
  { id: 'teal-wash', label: 'Teal wash', className: 'expr-hl--teal-wash' },
  { id: 'violet-wash', label: 'Violet wash', className: 'expr-hl--violet-wash' },
  { id: 'pink-soft', label: 'Soft pink', className: 'expr-hl--pink-soft' },
  { id: 'neon-lime', label: 'Neon lime', className: 'expr-hl--neon-lime' },
  { id: 'neon-magenta', label: 'Neon magenta', className: 'expr-hl--neon-magenta' },
]

export const EDITOR_HIGHLIGHT_CHOICES = ['none', 'yellow-soft', 'sage-wash', 'clay-wash']

export const SLASH_COMMANDS = [
  { id: 'h1', label: 'Title', hint: 'Fraunces, for the note', group: 'Structure', action: 'heading', value: 1 },
  { id: 'h2', label: 'Heading', hint: 'A section', group: 'Structure', action: 'heading', value: 2 },
  { id: 'h3', label: 'Subheading', hint: 'A smaller section', group: 'Structure', action: 'heading', value: 3 },
  { id: 'bullet', label: 'Bullet list', hint: 'A short list', group: 'Structure', action: 'bullet' },
  { id: 'numbered', label: 'Numbered list', hint: 'Steps, in order', group: 'Structure', action: 'ordered' },
  { id: 'quote', label: 'Client words', hint: 'A longer quotation, set apart', group: 'Writing', action: 'blockquote' },
  { id: 'voice', label: 'Their words', hint: 'Quoted, in Fraunces', group: 'Writing', action: 'voice', value: 'voice' },
  { id: 'aside', label: 'Aside', hint: 'A quieter reflection in the sentence', group: 'Writing', action: 'voice', value: 'aside' },
  { id: 'land', label: 'Landing line', hint: 'The phrase to come back to', group: 'Writing', action: 'voice', value: 'land' },
  { id: 'mark', label: 'Mark to return', hint: 'A soft highlight', group: 'Writing', action: 'highlight', value: 'yellow-soft' },
  { id: 'divider', label: 'Divider', hint: 'A line across the page', group: 'Insert', action: 'divider' },
  { id: 'table', label: 'Table', hint: 'Three columns', group: 'Insert', action: 'table', clinical: true },
  { id: 'image', label: 'Image', hint: 'A picture in the page', group: 'Insert', action: 'artwork' },
  { id: 'fill', label: 'Fill-in line', hint: 'A blank to complete', group: 'Insert', action: 'fill', clinical: true },
  ...MERGE_FIELD_OPTIONS.map((field) => ({
    id: `field-${field.key}`,
    label: field.label,
    hint: 'Label here, filled in a note or report',
    group: 'Fields',
    action: 'field',
    value: field.key,
    clinical: true,
  })),
  { id: 'dapnotes', label: 'DAP notes', hint: 'Data, assessment, plan', group: 'Modules', action: 'insertSnippet', value: 'dapnotes', clinical: true },
  { id: 'consent', label: 'Consent record', hint: 'A consent section', group: 'Modules', action: 'insertSnippet', value: 'consent', clinical: true },
]

/** HTML snippets inserted by clinical slash commands (section-level, not full templates). */
export const SLASH_SNIPPETS = {
  dapnotes: `<h2>DAP notes</h2>
<p><strong>Data</strong> — what was seen and heard:</p>
<p></p>
<p><strong>Assessment</strong> — what it means:</p>
<p></p>
<p><strong>Plan</strong> — what happens next:</p>
<p></p>`,
  consent: `<h2>Consent</h2>
<p><strong>Discussion held with:</strong> </p>
<p><strong>Date:</strong> </p>
<p><strong>Capacity considered:</strong> </p>
<ul>
<li>Purpose of the work explained</li>
<li>Benefits and limits discussed</li>
<li>Confidentiality explained</li>
<li>Right to withdraw explained</li>
</ul>
<p><strong>Consent outcome:</strong> </p>
<p></p>`,
}

export function slashCommandsFor(mode = 'basic') {
  return SLASH_COMMANDS.filter((cmd) => !cmd.clinical || mode === 'clinical')
}

export function filterSlashCommands(query, mode = 'basic') {
  const source = slashCommandsFor(mode)
  const q = query.trim().toLowerCase()
  if (!q) return source
  return source.filter((cmd) =>
    cmd.id.toLowerCase().includes(q)
    || cmd.label.toLowerCase().includes(q)
    || cmd.group.toLowerCase().includes(q)
    || cmd.hint.toLowerCase().includes(q),
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
