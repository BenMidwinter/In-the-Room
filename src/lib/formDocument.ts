import { bindLabel, type FormSchema, type MeasureSchema } from './formModel'

export type FormDocumentBlock = {
  kind: 'prose' | 'answer'
  label?: string
  text: string
}

function answerText(value: unknown): string {
  if (value == null || value === '') return '—'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return String(value)
}

export function formDocumentBlocks(
  schema: FormSchema,
  answers: Record<string, unknown>,
  measures: Record<string, MeasureSchema>,
): FormDocumentBlock[] {
  return schema.blocks.map((block) => {
    if (block.type === 'prose') return { kind: 'prose', text: block.text }
    if (block.type === 'measure') {
      const measure = measures[block.measureId]
      const raw = answers[block.id]
      const bag = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
      const lines = measure?.kind === 'items'
        ? measure.items.map((item) => `${item.label}: ${bag[item.id] ?? '—'}`)
        : [`Score: ${bag.score ?? '—'}`]
      return {
        kind: 'answer',
        label: block.label || measure?.kind || 'Questionnaire',
        text: lines.join('\n'),
      }
    }
    const label = block.type === 'client' ? (block.label || bindLabel(block.bind)) : block.label
    return { kind: 'answer', label, text: answerText(answers[block.id]) }
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formDocumentBodyHtml(blocks: FormDocumentBlock[]): string {
  return blocks.map((block) => {
    if (block.kind === 'prose') {
      return `<p class="form-prose">${escapeHtml(block.text).replace(/\n/g, '<br />')}</p>`
    }
    return `<section class="form-answer"><h2>${escapeHtml(block.label || '')}</h2><p>${escapeHtml(block.text).replace(/\n/g, '<br />')}</p></section>`
  }).join('')
}
