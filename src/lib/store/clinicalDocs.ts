import { db, uid } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { sortLatestFirst } from '../dateArchitecture'
import {
  parseOrThrow,
  progressNoteInputSchema,
  workingDocumentInputSchema,
  letterInputSchema,
} from '../schemas'
import {
  enrichProgressNoteLock,
  isProgressNoteEditable,
  lockUntilFromSignOff,
} from '../progressNoteLifecycle'

/* ── Progress notes ───────────────────────────────────────────────────── */

export function getProgressNotes(clientId) {
  return sortLatestFirst(
    db.progressNotes.filter(n => n.client_id === clientId).map(enrichProgressNoteLock),
    'session_date',
  )
}

/** Latest-first feed for notes history (strict YYYY-MM-DD session_date sort). */
export function getProgressNotesFeed(clientId) {
  return sortLatestFirst(
    db.progressNotes.filter(n => n.client_id === clientId).map(enrichProgressNoteLock),
    'session_date',
  )
}

export function getProgressNoteThemes(clientId) {
  const themes = new Set(
    db.progressNotes
      .filter(n => n.client_id === clientId && n.therapeutic_theme)
      .map(n => n.therapeutic_theme),
  )
  return [...themes].sort()
}

export function getProgressNote(noteId) {
  const note = db.progressNotes.find(n => n.id === noteId) || null
  return note ? enrichProgressNoteLock(note) : null
}

export function getProgressNoteByAppointment(appointmentId) {
  const note = db.progressNotes.find(n => n.appointment_id === appointmentId) || null
  return note ? enrichProgressNoteLock(note) : null
}

export function saveProgressNote(payload, userId) {
  payload = parseOrThrow(progressNoteInputSchema, payload, 'Progress note')
  const today = new Date().toISOString().split('T')[0]
  if (payload.id) {
    const idx = db.progressNotes.findIndex(n => n.id === payload.id)
    if (idx === -1) throw new Error('Note not found')
    if (!isProgressNoteEditable(db.progressNotes[idx] as Record<string, unknown>)) {
      throw new Error('This note is locked after the 48-hour amendment period.')
    }
    db.progressNotes[idx] = {
      ...db.progressNotes[idx],
      title: payload.title,
      content: payload.content,
      session_date: payload.session_date,
      modality_used: payload.modality_used ?? db.progressNotes[idx].modality_used,
      therapeutic_theme: payload.therapeutic_theme ?? db.progressNotes[idx].therapeutic_theme,
      artwork_attachments: payload.artwork_attachments ?? db.progressNotes[idx].artwork_attachments,
      appointment_id: payload.appointment_id !== undefined
        ? payload.appointment_id
        : db.progressNotes[idx].appointment_id,
      updated_at: today,
    }
    return enrichProgressNoteLock(db.progressNotes[idx])
  }

  const created = {
    id: uid('note'),
    client_id: payload.client_id,
    author_id: userId,
    appointment_id: payload.appointment_id || null,
    title: payload.title || 'Untitled progress note',
    content: payload.content || '<p></p>',
    session_date: payload.session_date || today,
    modality_used: payload.modality_used || null,
    therapeutic_theme: payload.therapeutic_theme || '',
    artwork_attachments: payload.artwork_attachments || [],
    status: 'draft',
    signed_off_at: null,
    lock_until: null,
    created_at: today,
    updated_at: today,
  }
  db.progressNotes.push(created as StoreRecord)
  return enrichProgressNoteLock(created)
}

/** Save content then start the 48-hour sign-off / lock countdown. */
export function signOffProgressNote(payload, userId) {
  const saved = saveProgressNote(payload, userId)
  const idx = db.progressNotes.findIndex(n => n.id === saved.id)
  if (idx === -1) throw new Error('Note not found')

  const now = new Date()
  db.progressNotes[idx] = {
    ...db.progressNotes[idx],
    status: 'signed_off',
    signed_off_at: now.toISOString(),
    lock_until: lockUntilFromSignOff(now),
    updated_at: now.toISOString().split('T')[0],
  }
  return enrichProgressNoteLock(db.progressNotes[idx])
}

export function getAllProgressNotes() {
  return [...db.progressNotes]
}

/* ── Working documents ────────────────────────────────────────────────── */

export function getWorkingDocuments(clientId) {
  return db.workingDocuments
    .filter(d => d.client_id === clientId)
    .sort((a, b) => new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime())
}

export function getWorkingDocument(docId) {
  return db.workingDocuments.find(d => d.id === docId) || null
}

export function saveWorkingDocument(payload, userId) {
  payload = parseOrThrow(workingDocumentInputSchema, payload, 'Document')
  const now = new Date().toISOString()
  if (payload.id) {
    const idx = db.workingDocuments.findIndex(d => d.id === payload.id)
    if (idx === -1) throw new Error('Document not found')
    db.workingDocuments[idx] = {
      ...db.workingDocuments[idx],
      title: payload.title,
      content: payload.content,
      updated_at: now,
    }
    return db.workingDocuments[idx]
  }

  const created = {
    id: uid('doc'),
    client_id: payload.client_id,
    author_id: userId,
    title: payload.title || 'Untitled document',
    content: payload.content || '<p></p>',
    created_at: now,
    updated_at: now,
  }
  db.workingDocuments.push(created)
  return created
}

/* ── Letters ──────────────────────────────────────────────────────────── */

export function getLetters(clientId) {
  return db.letters
    .filter(l => l.client_id === clientId)
    .sort((a, b) => new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime())
}

export function getLetter(letterId) {
  return db.letters.find(l => l.id === letterId) || null
}

export function saveLetter(payload, userId) {
  payload = parseOrThrow(letterInputSchema, payload, 'Letter')
  const now = new Date().toISOString()
  if (payload.id) {
    const idx = db.letters.findIndex(l => l.id === payload.id)
    if (idx === -1) throw new Error('Letter not found')
    db.letters[idx] = {
      ...db.letters[idx],
      title: payload.title,
      content: payload.content,
      recipient: payload.recipient || '',
      letter_date: payload.letter_date || db.letters[idx].letter_date,
      updated_at: now,
    }
    return db.letters[idx]
  }

  const created = {
    id: uid('letter'),
    client_id: payload.client_id,
    author_id: userId,
    title: payload.title || 'Untitled letter',
    content: payload.content || '<p></p>',
    recipient: payload.recipient || '',
    letter_date: payload.letter_date || now.split('T')[0],
    created_at: now,
    updated_at: now,
  }
  db.letters.push(created)
  return created
}
