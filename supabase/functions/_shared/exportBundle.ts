import { CLIENT_EXPORT_GROUPS, PRACTICE_EXPORT_GROUPS } from '../../../src/lib/exportGroups.js'
import { asObject, organizationIdFor, readEnvelope } from './practiceKey.ts'
import { adminClient } from './supabaseAdmin.ts'
import { zipStore, type ZipEntry } from './zipStore.ts'

const CLIENT_GROUPS = CLIENT_EXPORT_GROUPS.map((group) => group.id)
const PRACTICE_GROUPS = PRACTICE_EXPORT_GROUPS.map((group) => group.id)

const encoder = new TextEncoder()

type Admin = ReturnType<typeof adminClient>
type Row = Record<string, unknown>

export function allowedGroups(scope: 'client' | 'practice'): readonly string[] {
  return scope === 'practice' ? [...CLIENT_GROUPS, ...PRACTICE_GROUPS] : CLIENT_GROUPS
}

export async function buildExportArchive(
  admin: Admin,
  input: {
    userId: string
    scope: 'client' | 'practice'
    clientId: string | null
    include: string[]
    dateFrom: string | null
    dateTo: string | null
  },
): Promise<Uint8Array> {
  const chosen = new Set(input.include)
  let organizationId = ''
  try {
    organizationId = await organizationIdFor(admin, input.userId)
  } catch {
    organizationId = ''
  }
  const open = (format: unknown, payload: unknown) => openPayload(admin, organizationId, format, payload)
  const files: ZipEntry[] = []
  const clientId = input.scope === 'client' ? input.clientId : null
  const dates = input.scope === 'practice'
    ? { from: input.dateFrom, to: input.dateTo }
    : { from: null, to: null }

  const clients = await loadClients(admin, input.userId, clientId)
  if (input.scope === 'client' && !clients.length) throw new Error('That client is not on this account.')
  for (const client of clients) {
    const identity = await open(client.payload_format, client.encrypted_pseudonym)
    client.display_name = `${identity.first_name || ''} ${identity.surname || ''}`.trim()
  }

  for (const client of clients) {
    const folder = clientFolder(client)
    if (chosen.has('profile')) await addProfile(files, admin, input.userId, client, folder, open)
    if (chosen.has('contacts')) await addContacts(files, admin, input.userId, client.id, folder, open)
    if (chosen.has('notes')) await addHtmlRows(files, admin, input.userId, {
      table: 'progress_notes',
      folder: `${folder}/notes`,
      clientId: client.id,
      dateColumn: 'session_date',
      dates,
      open,
    })
    if (chosen.has('letters')) await addHtmlRows(files, admin, input.userId, {
      table: 'letters',
      folder: `${folder}/letters`,
      clientId: client.id,
      dateColumn: null,
      dates: { from: null, to: null },
      open,
    })
    if (chosen.has('documents')) {
      files.push(textFile(
        `${folder}/documents/files.txt`,
        'Uploaded client files are not stored in Process&Note yet.\n',
      ))
    }
    if (chosen.has('working_documents')) await addHtmlRows(files, admin, input.userId, {
      table: 'working_documents',
      folder: `${folder}/working-documents`,
      clientId: client.id,
      dateColumn: null,
      dates: { from: null, to: null },
      open,
    })
    if (chosen.has('reports')) await addHtmlRows(files, admin, input.userId, {
      table: 'reports',
      folder: `${folder}/reports`,
      clientId: client.id,
      dateColumn: 'report_date',
      dates: { from: null, to: null },
      open,
    })
    if (chosen.has('forms')) await addForms(files, admin, input.userId, client.id, folder, open)
    if (chosen.has('appointments')) await addAppointments(files, admin, input.userId, client.id, folder, 'client_session', dates, open)
    if (chosen.has('support')) await addAppointments(files, admin, input.userId, client.id, folder, 'support', dates, open)
    if (chosen.has('invoices')) await addInvoices(files, admin, input.userId, client.id, folder, dates, open)
  }

  if (input.scope === 'practice') {
    if (chosen.has('services')) await addServices(files, admin, input.userId)
    if (chosen.has('availability')) await addAvailability(files, admin, input.userId)
    if (chosen.has('journal')) await addHtmlRows(files, admin, input.userId, {
      table: 'journal_entries',
      folder: 'practice/journal',
      clientId: null,
      dateColumn: 'entry_date',
      dates,
      open,
    })
    if (chosen.has('practice_documents')) await addPracticeDocuments(files, admin, input.userId, open)
    if (chosen.has('cpd')) await addLogs(files, admin, input.userId, 'cpd_entries', 'occurred_on, minutes, label, payload_format, encrypted_payload', 'practice/cpd.csv', dates, open)
    if (chosen.has('supervision')) await addLogs(files, admin, input.userId, 'supervision_entries', 'occurred_on, minutes, label, direction, payload_format, encrypted_payload', 'practice/supervision.csv', dates, open)
    if (chosen.has('templates')) await addHtmlRows(files, admin, input.userId, {
      table: 'templates',
      folder: 'practice/templates',
      clientId: null,
      dateColumn: null,
      dates: { from: null, to: null },
      open,
    })
    if (chosen.has('form_designs')) await addJsonRows(files, admin, input.userId, 'form_definitions', 'practice/form-designs.json', 'sealed_payload', open)
    if (chosen.has('questionnaires')) await addJsonRows(files, admin, input.userId, 'outcome_measure_defs', 'practice/questionnaires.json', 'sealed_payload', open)
    if (chosen.has('tags')) await addTags(files, admin, input.userId, open)
    if (chosen.has('letterheads')) await addLetterheads(files, admin, input.userId)
    await addBank(files, admin, input.userId, organizationId)
  }

  const names = files.map((file) => file.path).sort()
  files.unshift(textFile('contents.txt', `${names.join('\n')}\n`))
  return zipStore(files)
}

async function loadClients(admin: Admin, userId: string, clientId: string | null) {
  const list = await selectRows(admin, 'clients', 'id, status, concession_kind, concession_percent, concession_pence, payload_format, encrypted_pseudonym', (query) => {
    let next = query.eq('owner_id', userId)
    if (clientId) next = next.eq('id', clientId)
    return next
  })
  return list
}

function clientFolder(client: Row): string {
  return `clients/${slug(String(client.display_name || 'client'))}-${String(client.id).slice(0, 8)}`
}

async function addProfile(
  files: ZipEntry[],
  admin: Admin,
  userId: string,
  client: Row,
  folder: string,
  open: Open,
) {
  const identityRows = await selectRows(admin, 'client_identities', 'client_id, payload_format, encrypted_payload', (query) => (
    query.eq('owner_id', userId).eq('client_id', client.id)
  ))
  const clinicalRows = await selectRows(admin, 'client_clinical_profiles', 'client_id, payload_format, encrypted_payload', (query) => (
    query.eq('owner_id', userId).eq('client_id', client.id)
  ))
  const identity = identityRows[0]
    ? await open(identityRows[0].payload_format, identityRows[0].encrypted_payload)
    : await open(client.payload_format, client.encrypted_pseudonym)
  const clinical = clinicalRows[0]
    ? await open(clinicalRows[0].payload_format, clinicalRows[0].encrypted_payload)
    : {}
  files.push(textFile(`${folder}/profile.json`, json({
    id: client.id,
    status: client.status,
    concession_kind: client.concession_kind,
    concession_percent: client.concession_percent,
    concession_pence: client.concession_pence,
    identity,
    clinical,
  })))
}

async function addContacts(files: ZipEntry[], admin: Admin, userId: string, clientId: string, folder: string, open: Open) {
  const list = await selectRows(admin, 'contacts', 'id, role, is_billing_contact, is_primary, payload_format, encrypted_payload', (query) => (
    query.eq('owner_id', userId).eq('client_id', clientId)
  ))
  const records: string[][] = []
  for (const row of list) {
    const body = await open(row.payload_format, row.encrypted_payload)
    records.push([
      String(body.name || ''),
      String(body.email || ''),
      String(body.phone || ''),
      String(row.role || ''),
      String(row.is_billing_contact || ''),
      String(row.is_primary || ''),
    ])
  }
  files.push(textFile(`${folder}/contacts.csv`, csv(['name', 'email', 'phone', 'role', 'billing', 'primary'], records)))
}

async function addHtmlRows(
  files: ZipEntry[],
  admin: Admin,
  userId: string,
  options: {
    table: string
    folder: string
    clientId: string | null
    dateColumn: string | null
    dates: Dates
    open: Open
  },
) {
  const list = await selectRows(admin, options.table, '*', (query) => {
    let next = query.eq('owner_id', userId)
    if (options.clientId) next = next.eq('client_id', options.clientId)
    next = applyDates(next, options.dateColumn, options.dates)
    return next
  })
  for (const row of list) {
    const payloadKey = row.encrypted_payload !== undefined ? 'encrypted_payload' : 'sealed_payload'
    const body = await options.open(row.payload_format, row[payloadKey])
    const title = String(body.title || body.name || row.label || row.kind || 'Document')
    const content = String(body.content || body.body || body.html || '')
    const when = String(row.session_date || row.letter_date || row.report_date || row.entry_date || row.created_at || '')
    files.push(textFile(
      `${options.folder}/${slug(when)}-${slug(title)}-${String(row.id).slice(0, 8)}.html`,
      htmlDocument(title, content, [`Date: ${when}`, `Status: ${String(row.status || '')}`].filter((line) => !line.endsWith(': '))),
    ))
  }
}

async function addForms(files: ZipEntry[], admin: Admin, userId: string, clientId: string, folder: string, open: Open) {
  const submissions = await selectRows(admin, 'form_submissions', 'id, form_definition_id, status, submitted_at, payload_format, encrypted_payload', (query) => (
    query.eq('owner_id', userId).eq('client_id', clientId)
  ))
  const scores = await selectRows(admin, 'outcome_entries', 'id, measure_id, recorded_on, completion_status, payload_format, encrypted_payload', (query) => (
    query.eq('owner_id', userId).eq('client_id', clientId)
  ))
  const openedSubmissions = []
  for (const row of submissions) {
    openedSubmissions.push({
      id: row.id,
      form_definition_id: row.form_definition_id,
      status: row.status,
      submitted_at: row.submitted_at,
      answers: await open(row.payload_format, row.encrypted_payload),
    })
  }
  const openedScores = []
  for (const row of scores) {
    openedScores.push({
      id: row.id,
      measure_id: row.measure_id,
      recorded_on: row.recorded_on,
      completion_status: row.completion_status,
      result: await open(row.payload_format, row.encrypted_payload),
    })
  }
  files.push(textFile(`${folder}/forms/submissions.json`, json(openedSubmissions)))
  files.push(textFile(`${folder}/forms/scores.json`, json(openedScores)))
}

async function addAppointments(
  files: ZipEntry[],
  admin: Admin,
  userId: string,
  clientId: string,
  folder: string,
  role: string,
  dates: Dates,
  open: Open,
) {
  const list = await selectRows(
    admin,
    'appointments',
    'id, starts_at, ends_at, appointment_type, attendance_status, block_role, charged_pence, service_id, payload_format, encrypted_payload',
    (query) => applyDates(
      query.eq('owner_id', userId).eq('client_id', clientId).eq('block_role', role),
      'starts_at',
      dates,
      'time',
    ),
  )
  const records: string[][] = []
  for (const row of list) {
    const body = await open(row.payload_format, row.encrypted_payload)
    records.push([
      String(row.starts_at || ''),
      String(row.ends_at || ''),
      String(row.appointment_type || ''),
      String(row.attendance_status || ''),
      String(row.service_id || ''),
      String(row.charged_pence ?? ''),
      String(body.note || body.notes || body.location || ''),
    ])
  }
  const name = role === 'support' ? 'support.csv' : 'appointments.csv'
  files.push(textFile(`${folder}/${name}`, csv(
    ['starts', 'ends', 'type', 'attendance', 'service_id', 'charged_pence', 'note'],
    records,
  )))
}

async function addInvoices(
  files: ZipEntry[],
  admin: Admin,
  userId: string,
  clientId: string,
  folder: string,
  dates: Dates,
  open: Open,
) {
  const list = await selectRows(
    admin,
    'invoices',
    'id, number, status, issued_on, due_on, total_pence, bill_to_name, bill_to_email, payment_details, payload_format, sealed_payload',
    (query) => applyDates(query.eq('owner_id', userId).eq('client_id', clientId), 'issued_on', dates),
  )
  const records: string[][] = []
  const details = []
  for (const row of list) {
    const body = await open(row.payload_format, row.sealed_payload)
    records.push([
      String(row.number || ''),
      String(row.status || ''),
      String(row.issued_on || ''),
      String(row.due_on || ''),
      String(row.total_pence ?? ''),
      String(body.bill_to_name || row.bill_to_name || ''),
      String(body.bill_to_email || row.bill_to_email || ''),
    ])
    const lines = await selectRows(admin, 'invoice_lines', 'description, session_date, unit_pence, quantity, includes_vat, payload_format, sealed_payload', (query) => (
      query.eq('owner_id', userId).eq('invoice_id', row.id)
    ))
    const openedLines = []
    for (const line of lines) {
      const lineBody = await open(line.payload_format, line.sealed_payload)
      openedLines.push({
        description: lineBody.description || line.description,
        session_date: line.session_date,
        unit_pence: line.unit_pence,
        quantity: line.quantity,
        includes_vat: line.includes_vat,
      })
    }
    details.push({
      id: row.id,
      number: row.number,
      lines: openedLines,
      payment_details: body.payment_details || row.payment_details || '',
    })
  }
  files.push(textFile(`${folder}/invoices.csv`, csv(
    ['number', 'status', 'issued', 'due', 'total_pence', 'bill_to_name', 'bill_to_email'],
    records,
  )))
  files.push(textFile(`${folder}/invoice-lines.json`, json(details)))
}

async function addServices(files: ZipEntry[], admin: Admin, userId: string) {
  const list = await selectRows(admin, 'services', 'name, service_type, description, default_duration_minutes, buffer_minutes, fee_pence, fee_includes_vat, is_active', (query) => (
    query.eq('owner_id', userId)
  ))
  files.push(textFile('practice/services.csv', csv(
    ['name', 'type', 'description', 'duration_minutes', 'buffer_minutes', 'fee_pence', 'fee_includes_vat', 'active'],
    list.map((row) => [
      String(row.name || ''),
      String(row.service_type || ''),
      String(row.description || ''),
      String(row.default_duration_minutes ?? ''),
      String(row.buffer_minutes ?? ''),
      String(row.fee_pence ?? ''),
      String(row.fee_includes_vat ?? ''),
      String(row.is_active ?? ''),
    ]),
  )))
}

async function addAvailability(files: ZipEntry[], admin: Admin, userId: string) {
  const rules = await selectRows(admin, 'availability_rules', 'timezone, weekly_hours, service_ids', (query) => query.eq('owner_id', userId))
  const exceptions = await selectRows(admin, 'availability_exceptions', 'starts_at, ends_at, kind, reason', (query) => query.eq('owner_id', userId))
  files.push(textFile('practice/availability.json', json({ rules, exceptions })))
}

async function addPracticeDocuments(files: ZipEntry[], admin: Admin, userId: string, open: Open) {
  const list = await selectRows(admin, 'practice_items', 'id, parent_id, kind, name, payload_format, encrypted_payload', (query) => (
    query.eq('owner_id', userId)
  ))
  for (const row of list) {
    if (row.kind === 'folder') continue
    const body = await open(row.payload_format, row.encrypted_payload)
    files.push(textFile(
      `practice/documents/${slug(String(row.name || 'document'))}-${String(row.id).slice(0, 8)}.html`,
      htmlDocument(String(row.name || 'Document'), String(body.content || ''), []),
    ))
  }
  files.push(textFile('practice/documents/folders.csv', csv(
    ['id', 'parent_id', 'kind', 'name'],
    list.map((row) => [String(row.id), String(row.parent_id || ''), String(row.kind || ''), String(row.name || '')]),
  )))
}

async function addLogs(
  files: ZipEntry[],
  admin: Admin,
  userId: string,
  table: string,
  columns: string,
  path: string,
  dates: Dates,
  open: Open,
) {
  const list = await selectRows(admin, table, columns, (query) => (
    applyDates(query.eq('owner_id', userId), 'occurred_on', dates)
  ))
  const records: string[][] = []
  for (const row of list) {
    const body = await open(row.payload_format, row.encrypted_payload)
    records.push([
      String(row.occurred_on || ''),
      String(row.minutes ?? ''),
      String(row.label || ''),
      String(row.direction || ''),
      String(body.notes || body.note || body.content || ''),
    ])
  }
  files.push(textFile(path, csv(['date', 'minutes', 'label', 'direction', 'notes'], records)))
}

async function addJsonRows(
  files: ZipEntry[],
  admin: Admin,
  userId: string,
  table: string,
  path: string,
  payloadKey: string,
  open: Open,
) {
  const list = await selectRows(admin, table, `id, name, slug, status, payload_format, ${payloadKey}`, (query) => (
    query.eq('owner_id', userId)
  ))
  const opened = []
  for (const row of list) {
    opened.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      body: await open(row.payload_format, row[payloadKey]),
    })
  }
  files.push(textFile(path, json(opened)))
}

async function addTags(files: ZipEntry[], admin: Admin, userId: string, open: Open) {
  const list = await selectRows(admin, 'tags', 'id, kind, name, color, payload_format, sealed_payload', (query) => (
    query.eq('owner_id', userId)
  ))
  const records: string[][] = []
  for (const row of list) {
    const body = row.payload_format === 'envelope'
      ? await open(row.payload_format, row.sealed_payload)
      : {}
    records.push([
      String(body.name || row.name || ''),
      String(row.kind || ''),
      String(body.color || row.color || ''),
    ])
  }
  files.push(textFile('practice/tags.csv', csv(['name', 'kind', 'colour'], records)))
}

async function addLetterheads(files: ZipEntry[], admin: Admin, userId: string) {
  const list = await selectRows(
    admin,
    'letterheads',
    'name, practice_name, address_line1, address_line2, address_line3, postcode, country, is_default',
    (query) => query.eq('owner_id', userId),
  )
  files.push(textFile('practice/letterheads.csv', csv(
    ['name', 'practice_name', 'address_line1', 'address_line2', 'address_line3', 'postcode', 'country', 'default'],
    list.map((row) => [
      String(row.name || ''),
      String(row.practice_name || ''),
      String(row.address_line1 || ''),
      String(row.address_line2 || ''),
      String(row.address_line3 || ''),
      String(row.postcode || ''),
      String(row.country || ''),
      String(row.is_default ?? ''),
    ]),
  )))
}

async function addBank(files: ZipEntry[], admin: Admin, userId: string, organizationId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('invoice_account_name, invoice_sort_code, invoice_account_number, invoice_payment_note, invoice_due_days, bank_format, sealed_bank')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return
  const bank = data.bank_format === 'envelope'
    ? await openPayload(admin, organizationId, data.bank_format, data.sealed_bank)
    : {
      invoice_account_name: data.invoice_account_name,
      invoice_sort_code: data.invoice_sort_code,
      invoice_account_number: data.invoice_account_number,
      invoice_payment_note: data.invoice_payment_note,
    }
  files.push(textFile('practice/bank-and-invoice.json', json({
    ...bank,
    invoice_due_days: data.invoice_due_days,
  })))
}

type Open = (format: unknown, payload: unknown) => Promise<Record<string, unknown>>
type Dates = { from: string | null; to: string | null }

async function openPayload(admin: Admin, organizationId: string, format: unknown, payload: unknown) {
  if (format === 'envelope') {
    if (!organizationId) throw new Error('The practice key could not be opened.')
    return readEnvelope(admin, organizationId, payload)
  }
  return asObject(payload)
}

async function selectRows(
  admin: Admin,
  table: string,
  columns: string,
  apply: (query: ReturnType<Admin['from']>) => ReturnType<Admin['from']>,
): Promise<Row[]> {
  const out: Row[] = []
  const size = 400
  for (let from = 0; from < 20000; from += size) {
    const { data, error } = await apply(admin.from(table).select(columns)).range(from, from + size - 1)
    if (error) throw new Error(error.message)
    const page = (data || []) as Row[]
    out.push(...page)
    if (page.length < size) break
  }
  return out
}

function applyDates(
  query: ReturnType<Admin['from']>,
  column: string | null,
  dates: Dates,
  kind: 'date' | 'time' = 'date',
) {
  if (!column) return query
  let next = query
  if (dates.from) next = next.gte(column, kind === 'time' ? `${dates.from}T00:00:00.000Z` : dates.from)
  if (dates.to) next = next.lte(column, kind === 'time' ? `${dates.to}T23:59:59.999Z` : dates.to)
  return next
}

function textFile(path: string, value: string): ZipEntry {
  return { path, data: encoder.encode(value) }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function csv(headers: string[], records: string[][]): string {
  return [...[headers], ...records]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
    .concat('\r\n')
}

function htmlDocument(title: string, body: string, meta: string[]): string {
  const article = body.trim().startsWith('<') ? body : `<p>${escapeHtml(body)}</p>`
  const lines = meta.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${lines}<article>${article}</article></body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function slug(value: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return clean.slice(0, 60) || 'item'
}
