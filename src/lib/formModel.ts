export const CLIENT_BINDS = [
  { key: 'first_name', label: 'First name' },
  { key: 'surname', label: 'Surname' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'school', label: 'School' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'medication', label: 'Medication' },
] as const

export type ClientBind = (typeof CLIENT_BINDS)[number]['key']

export type MeasureKind = 'overall' | 'items'

export type MeasureItem = { id: string; label: string }

export type MeasureSchema = {
  v: 1
  kind: MeasureKind
  min: number
  max: number
  items: MeasureItem[]
}

export type FormBlock =
  | { id: string; type: 'short_text' | 'long_text' | 'yes_no' | 'date'; label: string; required?: boolean }
  | { id: string; type: 'choice'; label: string; required?: boolean; options: string[] }
  | { id: string; type: 'client'; bind: ClientBind; label: string; required?: boolean }
  | { id: string; type: 'measure'; measureId: string; label?: string }
  | { id: string; type: 'prose'; text: string }

export type FormSchema = { v: 1; blocks: FormBlock[] }

export type ScoreResult = { total: number; items: Record<string, number> }

const BIND_KEYS = new Set<string>(CLIENT_BINDS.map((row) => row.key))

export function newFormId(): string {
  return crypto.randomUUID()
}

export function blankMeasure(kind: MeasureKind = 'items'): MeasureSchema {
  if (kind === 'overall') {
    return { v: 1, kind: 'overall', min: 1, max: 100, items: [] }
  }
  return {
    v: 1,
    kind: 'items',
    min: 0,
    max: 4,
    items: [{ id: newFormId(), label: '' }],
  }
}

export function blankForm(): FormSchema {
  return { v: 1, blocks: [] }
}

export function parseMeasureSchema(raw: unknown): MeasureSchema {
  const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const kind = row.kind === 'overall' ? 'overall' : 'items'
  const min = Number.isFinite(Number(row.min)) ? Number(row.min) : (kind === 'overall' ? 1 : 0)
  const max = Number.isFinite(Number(row.max)) ? Number(row.max) : (kind === 'overall' ? 100 : 4)
  const items = Array.isArray(row.items)
    ? row.items.map((item) => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return { id: String(entry.id || newFormId()), label: String(entry.label || '') }
    }).filter((item) => item.id)
    : []
  return { v: 1, kind, min, max, items }
}

export function parseFormSchema(raw: unknown): FormSchema {
  const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const blocks = Array.isArray(row.blocks) ? row.blocks.map(parseBlock).filter(Boolean) as FormBlock[] : []
  return { v: 1, blocks }
}

function parseBlock(raw: unknown): FormBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = String(row.id || '')
  if (!id) return null
  const label = String(row.label || '')
  const required = Boolean(row.required)
  if (row.type === 'prose') {
    return { id, type: 'prose', text: String(row.text || row.label || '') }
  }
  if (row.type === 'measure') {
    const measureId = String(row.measureId || '')
    if (!measureId) return null
    return { id, type: 'measure', measureId, label }
  }
  if (row.type === 'client') {
    const bind = String(row.bind || '')
    if (!BIND_KEYS.has(bind)) return null
    return { id, type: 'client', bind: bind as ClientBind, label: label || bindLabel(bind as ClientBind), required }
  }
  if (row.type === 'choice') {
    const options = Array.isArray(row.options) ? row.options.map((option) => String(option || '').trim()).filter(Boolean) : []
    return { id, type: 'choice', label, required, options }
  }
  if (row.type === 'long_text' || row.type === 'yes_no' || row.type === 'date' || row.type === 'short_text') {
    return { id, type: row.type, label, required }
  }
  return null
}

export function bindLabel(bind: ClientBind): string {
  return CLIENT_BINDS.find((row) => row.key === bind)?.label || bind
}

export function measureStructureKey(schema: MeasureSchema): string {
  const ids = schema.kind === 'overall' ? '' : schema.items.map((item) => item.id).join(',')
  return `${schema.kind}|${schema.min}|${schema.max}|${ids}`
}

export function measureEditIsBlocked(previous: MeasureSchema, next: MeasureSchema, hasScores: boolean): boolean {
  if (!hasScores) return false
  return measureStructureKey(previous) !== measureStructureKey(next)
}

export function scoreMeasure(schema: MeasureSchema, answer: unknown): ScoreResult {
  const min = schema.min
  const max = schema.max
  if (!(max >= min)) throw new Error('The scale on this questionnaire needs a highest score above the lowest.')
  if (schema.kind === 'overall') {
    const raw = answer && typeof answer === 'object' && !Array.isArray(answer)
      ? (answer as Record<string, unknown>).score
      : answer
    const value = readScore(raw, min, max, 'Enter the score.')
    return { total: value, items: { score: value } }
  }
  if (!schema.items.length) throw new Error('Add at least one statement.')
  const bag = answer && typeof answer === 'object' && !Array.isArray(answer)
    ? answer as Record<string, unknown>
    : {}
  const items: Record<string, number> = {}
  let total = 0
  for (const item of schema.items) {
    const value = readScore(bag[item.id], min, max, 'Enter a score for each statement.')
    items[item.id] = value
    total += value
  }
  return { total, items }
}

function readScore(raw: unknown, min: number, max: number, missing: string): number {
  if (raw === '' || raw == null) throw new Error(missing)
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isInteger(value)) throw new Error(missing)
  if (value < min || value > max) throw new Error(`Scores run from ${min} to ${max}.`)
  return value
}

export function outcomesInForm(
  form: FormSchema,
  measures: Record<string, MeasureSchema>,
  answers: Record<string, unknown>,
): Array<{ measureId: string; total: number; items: Record<string, number> }> {
  return form.blocks.flatMap((block) => {
    if (block.type !== 'measure') return []
    const schema = measures[block.measureId]
    if (!schema) throw new Error('A questionnaire on this form is missing.')
    const scored = scoreMeasure(schema, answers[block.id])
    return [{ measureId: block.measureId, total: scored.total, items: scored.items }]
  })
}

export function missingAnswers(form: FormSchema, answers: Record<string, unknown>, measures: Record<string, MeasureSchema>): string | null {
  for (const block of form.blocks) {
    if (block.type === 'measure') {
      const schema = measures[block.measureId]
      if (!schema) return 'A questionnaire on this form is missing.'
      try {
        scoreMeasure(schema, answers[block.id])
      } catch (err) {
        return err instanceof Error ? err.message : 'Enter a score for each statement.'
      }
      continue
    }
    if (!('required' in block) || !block.required) continue
    const value = answers[block.id]
    if (value == null || String(value).trim() === '') return 'Fill in the required questions before sending.'
  }
  return null
}

export function clientPatchFromAnswers(form: FormSchema, answers: Record<string, unknown>): Partial<Record<ClientBind, string>> {
  const patch: Partial<Record<ClientBind, string>> = {}
  for (const block of form.blocks) {
    if (block.type !== 'client') continue
    const value = String(answers[block.id] ?? '').trim()
    if (value) patch[block.bind] = value
  }
  return patch
}

export function prefillClientAnswers(
  form: FormSchema,
  client: Partial<Record<ClientBind, string>> | null | undefined,
): Record<string, string> {
  const answers: Record<string, string> = {}
  if (!client) return answers
  for (const block of form.blocks) {
    if (block.type !== 'client') continue
    const value = String(client[block.bind] || '').trim()
    if (value) answers[block.id] = value
  }
  return answers
}

export function slugify(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return base || 'form'
}

export function scaleUsesButtons(schema: MeasureSchema): boolean {
  return Number.isInteger(schema.min)
    && Number.isInteger(schema.max)
    && schema.max >= schema.min
    && (schema.max - schema.min) <= 12
}

export function submissionStatusLabel(status: string, started = false): string {
  if (status === 'in_progress') return started ? 'In progress' : 'Not started'
  if (status === 'rejected') return 'Not used'
  return 'Completed'
}

export function validateDraftName(name: string, kind: 'form' | 'questionnaire'): string | null {
  if (!name.trim()) {
    return kind === 'form' ? 'Name the form.' : 'Name the questionnaire.'
  }
  return null
}

export function validateMeasure(name: string, schema: MeasureSchema): string | null {
  if (!name.trim()) return 'Name the questionnaire.'
  if (!Number.isInteger(schema.min) || !Number.isInteger(schema.max) || schema.max < schema.min) {
    return 'Set a highest score that is a whole number, at or above the lowest.'
  }
  if (schema.kind === 'items') {
    if (!schema.items.length) return 'Add at least one statement.'
    if (schema.items.some((item) => !item.label.trim())) return 'Write each statement.'
  }
  return null
}

export function validateForm(name: string, schema: FormSchema): string | null {
  if (!name.trim()) return 'Name the form.'
  if (!schema.blocks.length) return 'Add at least one question.'
  for (const block of schema.blocks) {
    if (block.type === 'prose') {
      if (!block.text.trim()) return 'Write the text for each section.'
      continue
    }
    if (block.type === 'measure') {
      if (!block.measureId) return 'Choose a questionnaire for each score.'
      continue
    }
    if (!('label' in block) || !block.label.trim()) return 'Write a question for each part of the form.'
    if (block.type === 'choice' && block.options.filter((option) => option.trim()).length < 2) {
      return 'Add at least two choices.'
    }
  }
  return null
}

export function moveListItem<T>(list: T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  const [row] = next.splice(from, 1)
  next.splice(to, 0, row)
  return next
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export type CsvScoreRow = {
  recordedOn: string
  clientName: string
  dob: string
  gender: string
  total: number
  items: Record<string, number>
}

/** One row per completion, in the order of the questionnaire. Population tables stay outside the app. */
export function measureScoresCsv(schema: MeasureSchema, rows: CsvScoreRow[]): string {
  const itemColumns = schema.kind === 'overall'
    ? []
    : schema.items.map((item) => item.label.trim() || 'Statement')
  const header = ['Date', 'Client', 'Date of birth', 'Gender', 'Score', ...itemColumns]
  const lines = [header.map(csvCell).join(',')]
  const sorted = [...rows].sort((a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.clientName.localeCompare(b.clientName))
  for (const row of sorted) {
    const itemValues = schema.kind === 'overall'
      ? []
      : schema.items.map((item) => row.items[item.id] ?? '')
    lines.push([
      row.recordedOn,
      row.clientName,
      row.dob,
      row.gender,
      row.total,
      ...itemValues,
    ].map(csvCell).join(','))
  }
  return `${lines.join('\n')}\n`
}
