export type LogKind = 'cpd' | 'supervision'
export type SupervisionDirection = 'delivered' | 'received'

export type PracticeLog = {
  id: string
  kind: LogKind
  occurred_on: string
  minutes: number
  label: string
  direction: SupervisionDirection | null
  content: string
  created_at: string
  updated_at: string
}

export type PracticeLogInput = {
  id?: string | null
  occurredOn?: string
  hours?: number | string
  label?: string
  direction?: string | null
  content?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function hoursFromMinutes(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

export function logContentFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '<p></p>'
  const content = (payload as { content?: unknown }).content
  return typeof content === 'string' && content.trim() ? content : '<p></p>'
}

export function logPayload(content: string) {
  return { v: 0, content }
}

export function normalizePracticeLogInput(kind: LogKind, input: PracticeLogInput) {
  const occurredOn = String(input.occurredOn || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new Error('Choose a date.')
  }

  const rawHours = typeof input.hours === 'number' ? input.hours : Number(String(input.hours ?? '').trim())
  if (!Number.isFinite(rawHours) || rawHours < 0 || rawHours > 1000) {
    throw new Error('Enter the hours as a number from 0 to 1000.')
  }
  const minutes = Math.round(rawHours * 60)
  if (minutes > 60000) {
    throw new Error('Enter the hours as a number from 0 to 1000.')
  }

  const trimmed = String(input.label || '').trim()
  const label = trimmed || (kind === 'cpd' ? 'CPD' : 'Supervision')
  if (label.length > 180) throw new Error('Use a shorter title.')

  let direction: SupervisionDirection | null = null
  if (kind === 'supervision') {
    if (input.direction !== 'delivered' && input.direction !== 'received') {
      throw new Error('Choose whether this supervision was delivered or received.')
    }
    direction = input.direction
  }

  const requestedId = input.id && input.id !== 'new' ? input.id : null
  const id = requestedId && UUID_RE.test(requestedId) ? requestedId : null
  const content = typeof input.content === 'string' && input.content.trim() ? input.content : '<p></p>'

  return { id, occurred_on: occurredOn, minutes, label, direction, content }
}
