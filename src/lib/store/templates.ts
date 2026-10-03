import { db, uid } from '../data/collections'
import { parseOrThrow, orgTemplateInputSchema } from '../schemas'

/* ── Progress note templates ──────────────────────────────────────────── */

export function getProgressNoteTemplates() {
  return [...db.progressNoteTemplates].sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export function getAvailableProgressNoteTemplates(workplaceId) {
  return getProgressNoteTemplates().filter(
    t => t.is_active !== false && (!t.workplace_id || t.workplace_id === workplaceId),
  )
}

export function getProgressNoteTemplate(templateId) {
  return db.progressNoteTemplates.find(t => t.id === templateId) || null
}

export function saveProgressNoteTemplate(payload) {
  const data = parseOrThrow(orgTemplateInputSchema, payload, 'Progress note template')
  const now = new Date().toISOString()
  const workplace = data.workplace_id
    ? db.workplaces.find(w => w.id === data.workplace_id)
    : null

  if (data.id) {
    const idx = db.progressNoteTemplates.findIndex(t => t.id === data.id)
    if (idx === -1) throw new Error('Template not found')
    db.progressNoteTemplates[idx] = {
      ...db.progressNoteTemplates[idx],
      name: data.name,
      description: data.description ?? '',
      workplace_id: data.workplace_id || null,
      workplace_name: workplace?.name || 'All workplaces',
      content: data.content ?? db.progressNoteTemplates[idx].content,
      is_active: data.is_active ?? db.progressNoteTemplates[idx].is_active,
      updated_at: now,
    }
    return db.progressNoteTemplates[idx]
  }

  const created = {
    id: uid('pnt'),
    name: data.name,
    description: data.description || '',
    workplace_id: data.workplace_id || null,
    workplace_name: workplace?.name || 'All workplaces',
    content: data.content || '<p></p>',
    is_active: data.is_active ?? true,
    created_at: now,
    updated_at: now,
  }
  db.progressNoteTemplates.push(created)
  return created
}

/* ── Letter templates ─────────────────────────────────────────────────── */

export function getLetterTemplates() {
  return [...db.letterTemplates].sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export function getAvailableLetterTemplates(workplaceId) {
  return getLetterTemplates().filter(
    t => t.is_active !== false && (!t.workplace_id || t.workplace_id === workplaceId),
  )
}

export function getLetterTemplate(templateId) {
  return db.letterTemplates.find(t => t.id === templateId) || null
}

export function saveLetterTemplate(payload) {
  const data = parseOrThrow(orgTemplateInputSchema, payload, 'Letter template')
  const now = new Date().toISOString()
  const workplace = data.workplace_id
    ? db.workplaces.find(w => w.id === data.workplace_id)
    : null

  if (data.id) {
    const idx = db.letterTemplates.findIndex(t => t.id === data.id)
    if (idx === -1) throw new Error('Template not found')
    db.letterTemplates[idx] = {
      ...db.letterTemplates[idx],
      name: data.name,
      description: data.description ?? '',
      workplace_id: data.workplace_id || null,
      workplace_name: workplace?.name || 'All workplaces',
      content: data.content ?? db.letterTemplates[idx].content,
      is_active: data.is_active ?? db.letterTemplates[idx].is_active,
      updated_at: now,
    }
    return db.letterTemplates[idx]
  }

  const created = {
    id: uid('lt'),
    name: data.name,
    description: data.description || '',
    workplace_id: data.workplace_id || null,
    workplace_name: workplace?.name || 'All workplaces',
    content: data.content || '<p></p>',
    is_active: data.is_active ?? true,
    created_at: now,
    updated_at: now,
  }
  db.letterTemplates.push(created)
  return created
}
