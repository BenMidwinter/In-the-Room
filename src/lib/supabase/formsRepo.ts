import {
  measureEditIsBlocked,
  mergeEmptyClientAnswers,
  parseFormSchema,
  parseMeasureSchema,
  prefillClientAnswers,
  scoreMeasure,
  slugify,
  validateDraftName,
  validateForm,
  validateMeasure,
  type ClientBind,
  type CsvScoreRow,
  type FormSchema,
  type MeasureSchema,
} from '../formModel'
import { createClinicalRecord, invokeFormRecord, sealClinicalRecord, withOpenedPayloads } from './clinicalEnvelope'
import { getSupabase } from './client'
import type { Json } from './database.types'

type Sealable = {
  id: string
  name?: string | null
  schema?: Json | null
  payload_format?: string | null
  sealed_payload?: Json | null
}

function sealedBody(payload: unknown): { name: string; schema: unknown } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { name: '', schema: {} }
  const row = payload as Record<string, unknown>
  return { name: String(row.name || ''), schema: row.schema ?? {} }
}

async function revealNamed<T extends Sealable>(
  table: 'form_definitions' | 'outcome_measure_defs',
  rows: T[],
): Promise<T[]> {
  const opened = await withOpenedPayloads(table, rows.map((row) => ({
    ...row,
    sealed_payload: row.sealed_payload ?? {},
  })), { payloadKey: 'sealed_payload' })
  return opened.map((row) => {
    if (row.payload_format !== 'envelope') return row
    const body = sealedBody(row.sealed_payload)
    return { ...row, name: body.name, schema: body.schema as Json }
  })
}

export type MeasureRecord = {
  id: string
  name: string
  slug: string
  schema: MeasureSchema
  is_active: boolean
  has_scores: boolean
  status: 'draft' | 'published'
}

export type FormRecord = {
  id: string
  name: string
  slug: string
  audience: 'public' | 'private'
  status: string
  is_onboarding: boolean
  place_on_screener: boolean
  autofill_client: boolean
  letterhead_id: string | null
  version: number
  schema: FormSchema
}

export type EpisodeFormRow = {
  id: string
  token: string
  name: string
  status: string
  started: boolean
  updated_at: string
  submitted_at: string | null
}

export type EpisodeOutcomeRow = {
  id: string
  measure_id: string
  measure_name: string
  recorded_on: string
  total: number
  items: Record<string, number>
  schema: MeasureSchema
}

export type MeasureScoreExport = {
  name: string
  slug: string
  schema: MeasureSchema
  rows: CsvScoreRow[]
}

export type OpenFormLink = {
  title: string
  status: string
  schema: FormSchema
  measures: Record<string, MeasureSchema>
  answers: Record<string, unknown>
  letterhead: {
    practiceName: string
    logoUrl: string
    addressLines: string[]
    clinicianName: string
    professionalTitle: string
  } | null
}

type DbError = { message: string; code?: string }

function supabaseOrThrow() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Sign in required')
  return supabase
}

function cleanError(error: DbError): Error {
  if (error.code === '23505') return new Error('That name is already in use. Choose another.')
  const text = error.message.replace(/^.*ERROR:\s*/i, '').split('\n')[0].trim()
  return new Error(text || 'Something went wrong.')
}

function throwIf(error: DbError | null): void {
  if (error) throw cleanError(error)
}

function rowOrThrow<T>(data: T | null, error: DbError | null, missing: string): asserts data is NonNullable<T> {
  if (error || data == null) throw error ? cleanError(error) : new Error(missing)
}

function asObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

function identityBits(raw: Json | null | undefined) {
  const row = asObject(raw)
  const first = String(row.first_name || '').trim()
  const surname = String(row.surname || '').trim()
  return {
    first_name: first,
    surname,
    dob: String(row.dob || ''),
    gender: String(row.gender || ''),
    school: String(row.school || ''),
    diagnosis: String(row.diagnosis || ''),
    medication: String(row.medication || ''),
    name: `${first} ${surname}`.trim() || 'Client',
  }
}

function clientBinds(raw: Json | null | undefined): Partial<Record<ClientBind, string>> {
  const who = identityBits(raw)
  return {
    first_name: who.first_name,
    surname: who.surname,
    dob: who.dob,
    gender: who.gender,
    school: who.school,
    diagnosis: who.diagnosis,
    medication: who.medication,
  }
}

function scorePayload(raw: Json | null | undefined): { total: number; items: Record<string, number> } {
  const row = asObject(raw)
  const itemsRaw = asObject(row.items)
  const items: Record<string, number> = {}
  for (const [key, value] of Object.entries(itemsRaw)) {
    const number = typeof value === 'number' ? value : Number(value)
    if (Number.isInteger(number)) items[key] = number
  }
  return { total: Number(row.total) || 0, items }
}

function measureStatus(value: string | null | undefined): 'draft' | 'published' {
  return value === 'draft' ? 'draft' : 'published'
}

function answersStarted(raw: Json | null | undefined): boolean {
  const answers = asObject(asObject(raw).answers)
  return Object.values(answers).some((value) => {
    if (value == null) return false
    if (typeof value === 'string') return value.trim() !== ''
    if (typeof value === 'number') return true
    if (typeof value === 'object') return Object.keys(value as object).length > 0
    return false
  })
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

async function signedIn() {
  const supabase = supabaseOrThrow()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  return { supabase, user }
}

async function uniqueSlug(
  table: 'outcome_measure_defs' | 'form_definitions',
  name: string,
  ignoreId?: string,
) {
  const supabase = supabaseOrThrow()
  const base = slugify(name)
  let slug = base
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase.from(table).select('id').eq('slug', slug).maybeSingle()
    throwIf(error)
    if (!data || data.id === ignoreId) return slug
    slug = `${base}-${crypto.randomUUID().slice(0, 4)}`
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

export async function listMeasures(): Promise<MeasureRecord[]> {
  const supabase = supabaseOrThrow()
  const { data, error } = await supabase
    .from('outcome_measure_defs')
    .select('id, name, slug, schema, is_active, status, payload_format, sealed_payload')
  throwIf(error)
  const revealed = await revealNamed('outcome_measure_defs', data || [])
  const { data: scores, error: scoreError } = await supabase
    .from('outcome_entries')
    .select('measure_id')
  throwIf(scoreError)
  const used = new Set((scores || []).map((row) => row.measure_id))
  return revealed.map((row) => ({
    id: row.id,
    name: row.name || '',
    slug: row.slug,
    schema: parseMeasureSchema(row.schema),
    is_active: row.is_active && measureStatus(row.status) === 'published',
    has_scores: used.has(row.id),
    status: measureStatus(row.status),
  }))
}

export async function saveMeasure(input: {
  id?: string | null
  name: string
  schema: MeasureSchema
  publish: boolean
}): Promise<MeasureRecord> {
  const name = input.name.trim()
  const schema = parseMeasureSchema(input.schema)
  const nameProblem = validateDraftName(name, 'questionnaire')
  if (nameProblem) throw new Error(nameProblem)
  const { supabase } = await signedIn()

  if (input.id) {
    const { count, error: countError } = await supabase
      .from('outcome_entries')
      .select('id', { count: 'exact', head: true })
      .eq('measure_id', input.id)
    throwIf(countError)
    const { data: existing, error: existingError } = await supabase
      .from('outcome_measure_defs')
      .select('schema, slug, status, payload_format, sealed_payload')
      .eq('id', input.id)
      .single()
    rowOrThrow(existing, existingError, 'Could not load that questionnaire.')
    const [openedExisting] = await revealNamed('outcome_measure_defs', [{ ...existing, id: input.id }])
    const hasScores = (count || 0) > 0
    if (measureEditIsBlocked(parseMeasureSchema(openedExisting.schema), schema, hasScores)) {
      throw new Error('Scores are already saved. You can change the wording. A new scale needs a new questionnaire.')
    }
    const status: 'draft' | 'published' = (input.publish || existing.status === 'published') ? 'published' : 'draft'
    if (status === 'published') {
      const problem = validateMeasure(name, schema)
      if (problem) throw new Error(problem)
    }
    await sealClinicalRecord('outcome_measure_defs', input.id, { v: 0, name, schema })
    const { error } = await supabase
      .from('outcome_measure_defs')
      .update({
        status,
        is_active: status === 'published',
      })
      .eq('id', input.id)
    throwIf(error)
    return {
      id: input.id,
      name,
      slug: existing.slug,
      schema,
      is_active: status === 'published',
      has_scores: hasScores,
      status,
    }
  }

  const status: 'draft' | 'published' = input.publish ? 'published' : 'draft'
  if (status === 'published') {
    const problem = validateMeasure(name, schema)
    if (problem) throw new Error(problem)
  }
  const slug = await uniqueSlug('outcome_measure_defs', name)
  const data = await createClinicalRecord('outcome_measure_defs', {
    slug,
    is_active: status === 'published',
    status,
  }, { v: 0, name, schema })
  return { id: data.id, name, slug, schema, is_active: status === 'published', has_scores: false, status }
}

export async function deleteMeasure(id: string): Promise<void> {
  const supabase = supabaseOrThrow()
  const { count, error: countError } = await supabase
    .from('outcome_entries')
    .select('id', { count: 'exact', head: true })
    .eq('measure_id', id)
  throwIf(countError)
  if (count) throw new Error('This questionnaire already has scores, so it stays in your list.')
  const { error } = await supabase.from('outcome_measure_defs').delete().eq('id', id)
  throwIf(error)
}

export async function listForms(): Promise<FormRecord[]> {
  const supabase = supabaseOrThrow()
  const { data, error } = await supabase
    .from('form_definitions')
    .select('id, name, slug, audience, status, is_onboarding, place_on_screener, autofill_client, letterhead_id, version, schema, payload_format, sealed_payload')
    .neq('status', 'archived')
  throwIf(error)
  const revealed = await revealNamed('form_definitions', data || [])
  return revealed.map((row) => ({
    id: row.id,
    name: row.name || '',
    slug: row.slug,
    audience: row.audience === 'public' ? 'public' : 'private',
    status: row.status,
    is_onboarding: row.is_onboarding,
    place_on_screener: Boolean(row.place_on_screener),
    autofill_client: row.autofill_client !== false,
    letterhead_id: row.letterhead_id,
    version: row.version,
    schema: parseFormSchema(row.schema),
  }))
}

async function assertPublishedMeasures(
  supabase: ReturnType<typeof supabaseOrThrow>,
  schema: FormSchema,
) {
  const ids = [...new Set(schema.blocks.flatMap((block) => (
    block.type === 'measure' && block.measureId ? [block.measureId] : []
  )))]
  if (!ids.length) return
  const { data, error } = await supabase
    .from('outcome_measure_defs')
    .select('id, status')
    .in('id', ids)
  throwIf(error)
  const ready = new Set((data || []).filter((row) => row.status === 'published').map((row) => row.id))
  if (ids.some((id) => !ready.has(id))) {
    throw new Error('Publish the questionnaire on this form before you publish the form.')
  }
}

export async function saveForm(input: {
  id?: string | null
  name: string
  audience: 'public' | 'private'
  schema: FormSchema
  publish: boolean
  placeOnScreener?: boolean
  autofillClient?: boolean
  letterheadId?: string | null
}): Promise<FormRecord> {
  const name = input.name.trim()
  const schema = parseFormSchema(input.schema)
  const nameProblem = validateDraftName(name, 'form')
  if (nameProblem) throw new Error(nameProblem)
  const { supabase } = await signedIn()

  if (input.id) {
    const { data: existing, error: existingError } = await supabase
      .from('form_definitions')
      .select('audience, version, slug, status')
      .eq('id', input.id)
      .single()
    rowOrThrow(existing, existingError, 'Could not load that form.')
    const audience = existing.audience === 'public' ? 'public' : 'private'
    const placeOnScreener = audience === 'public' && Boolean(input.placeOnScreener)
    const autofillClient = input.autofillClient !== false
    const letterheadId = input.letterheadId || null
    const status = (input.publish || existing.status === 'published') ? 'published' : 'draft'
    if (status === 'published') {
      const problem = validateForm(name, schema)
      if (problem) throw new Error(problem)
      await assertPublishedMeasures(supabase, schema)
    }
    const version = (existing.version || 1) + 1
    await sealClinicalRecord('form_definitions', input.id, { v: 0, name, description: '', schema })
    const { error } = await supabase
      .from('form_definitions')
      .update({
        audience,
        is_onboarding: audience === 'public',
        place_on_screener: placeOnScreener,
        autofill_client: autofillClient,
        letterhead_id: letterheadId,
        status,
        version,
      })
      .eq('id', input.id)
    throwIf(error)
    return {
      id: input.id,
      name,
      slug: existing.slug,
      audience,
      status,
      is_onboarding: audience === 'public',
      place_on_screener: placeOnScreener,
      autofill_client: autofillClient,
      letterhead_id: letterheadId,
      version,
      schema,
    }
  }

  const audience = input.audience === 'public' ? 'public' : 'private'
  const placeOnScreener = audience === 'public' && Boolean(input.placeOnScreener)
  const autofillClient = input.autofillClient !== false
  const letterheadId = input.letterheadId || null
  const status = input.publish ? 'published' : 'draft'
  if (status === 'published') {
    const problem = validateForm(name, schema)
    if (problem) throw new Error(problem)
    await assertPublishedMeasures(supabase, schema)
  }
  const slug = await uniqueSlug('form_definitions', name)
  const data = await createClinicalRecord('form_definitions', {
    slug,
    audience,
    status,
    is_onboarding: audience === 'public',
    place_on_screener: placeOnScreener,
    autofill_client: autofillClient,
    letterhead_id: letterheadId,
    version: 1,
  }, { v: 0, name, description: '', schema })
  return {
    id: data.id,
    name,
    slug,
    audience,
    status,
    is_onboarding: audience === 'public',
    place_on_screener: placeOnScreener,
    autofill_client: autofillClient,
    letterhead_id: letterheadId,
    version: 1,
    schema,
  }
}

export async function duplicateForm(id: string): Promise<FormRecord> {
  const forms = await listForms()
  const source = forms.find((form) => form.id === id)
  if (!source) throw new Error('Could not find that form.')
  return saveForm({
    name: `${source.name} copy`,
    audience: source.audience,
    schema: source.schema,
    publish: false,
    placeOnScreener: source.place_on_screener,
    autofillClient: source.autofill_client,
    letterheadId: source.letterhead_id,
  })
}

export async function setFormPlaceOnScreener(id: string, placeOnScreener: boolean): Promise<void> {
  const supabase = supabaseOrThrow()
  const { data, error } = await supabase
    .from('form_definitions')
    .select('audience')
    .eq('id', id)
    .single()
  rowOrThrow(data, error, 'Could not load that form.')
  if (data.audience !== 'public') {
    throw new Error('Only a shared form can place the person on the screener.')
  }
  const { error: updateError } = await supabase
    .from('form_definitions')
    .update({ place_on_screener: placeOnScreener })
    .eq('id', id)
  throwIf(updateError)
}

export async function deleteForm(id: string): Promise<'deleted' | 'archived'> {
  const supabase = supabaseOrThrow()
  const { count, error: countError } = await supabase
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('form_definition_id', id)
  throwIf(countError)
  if (count) {
    const { error } = await supabase.from('form_definitions').update({ status: 'archived' }).eq('id', id)
    throwIf(error)
    return 'archived'
  }
  const { error } = await supabase.from('form_definitions').delete().eq('id', id)
  throwIf(error)
  return 'deleted'
}

export async function deleteSubmission(id: string): Promise<void> {
  const supabase = supabaseOrThrow()
  const { error } = await supabase.from('form_submissions').delete().eq('id', id)
  throwIf(error)
}

export async function listEpisodeForms(episodeId: string): Promise<EpisodeFormRow[]> {
  if (!episodeId) return []
  const supabase = supabaseOrThrow()
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, access_token, status, submitted_at, updated_at, encrypted_payload, payload_format, form_definitions(id, name, payload_format, sealed_payload)')
    .eq('episode_id', episodeId)
    .order('updated_at', { ascending: false })
  throwIf(error)
  const rows = await withOpenedPayloads('form_submissions', data || [])
  const defs = rows.flatMap((row) => {
    const def = one(row.form_definitions as Sealable | Sealable[] | null)
    return def?.id ? [def] : []
  })
  const openedDefs = await revealNamed('form_definitions', defs)
  const defName = new Map(openedDefs.map((def) => [def.id, def.name || 'Form']))
  return rows.map((row) => {
    const def = one(row.form_definitions as { id?: string } | { id?: string }[] | null)
    return {
      id: row.id,
      token: row.access_token,
      name: defName.get(def?.id || '') || 'Form',
      status: row.status,
      started: row.status !== 'in_progress' || answersStarted(row.encrypted_payload),
      updated_at: row.updated_at,
      submitted_at: row.submitted_at,
    }
  })
}

export async function listEpisodeOutcomes(episodeId: string): Promise<EpisodeOutcomeRow[]> {
  if (!episodeId) return []
  const supabase = supabaseOrThrow()
  const { data, error } = await supabase
    .from('outcome_entries')
    .select('id, measure_id, recorded_on, encrypted_payload, payload_format, outcome_measure_defs(id, name, schema, payload_format, sealed_payload)')
    .eq('episode_id', episodeId)
    .eq('completion_status', 'complete')
    .order('recorded_on', { ascending: false })
  throwIf(error)
  const rows = await withOpenedPayloads('outcome_entries', data || [])
  const defs = rows.flatMap((row) => {
    const def = one(row.outcome_measure_defs as Sealable | Sealable[] | null)
    return def?.id ? [def] : []
  })
  const openedDefs = await revealNamed('outcome_measure_defs', defs)
  const defById = new Map(openedDefs.map((def) => [def.id, def]))
  return rows.map((row) => {
    const linked = one(row.outcome_measure_defs as { id?: string } | { id?: string }[] | null)
    const def = linked?.id ? defById.get(linked.id) : null
    const scored = scorePayload(row.encrypted_payload)
    return {
      id: row.id,
      measure_id: row.measure_id,
      measure_name: def?.name || 'Questionnaire',
      recorded_on: String(row.recorded_on).slice(0, 10),
      total: scored.total,
      items: scored.items,
      schema: parseMeasureSchema(def?.schema),
    }
  })
}

export async function listMeasureScores(measureId: string, clientId?: string): Promise<MeasureScoreExport> {
  const supabase = supabaseOrThrow()
  const { data: def, error } = await supabase
    .from('outcome_measure_defs')
    .select('id, name, slug, schema, payload_format, sealed_payload')
    .eq('id', measureId)
    .single()
  rowOrThrow(def, error, 'Could not load that questionnaire.')
  const [openedDef] = await revealNamed('outcome_measure_defs', [def])
  let query = supabase
    .from('outcome_entries')
    .select('id, recorded_on, encrypted_payload, payload_format, client_id')
    .eq('measure_id', measureId)
    .eq('completion_status', 'complete')
  if (clientId) query = query.eq('client_id', clientId)
  const { data: entries, error: entryError } = await query
  throwIf(entryError)
  const openedEntries = await withOpenedPayloads('outcome_entries', entries || [])
  const ids = [...new Set(openedEntries.map((row) => row.client_id))]
  const names = new Map<string, ReturnType<typeof identityBits>>()
  if (ids.length) {
    const { data: identities, error: identityError } = await supabase
      .from('client_identities')
      .select('client_id, encrypted_payload, payload_format')
      .in('client_id', ids)
    throwIf(identityError)
    const openedIdentities = await withOpenedPayloads('client_identities', (identities || []).map((row) => ({
      id: row.client_id,
      payload_format: row.payload_format,
      encrypted_payload: row.encrypted_payload,
    })))
    for (const row of openedIdentities) names.set(row.id, identityBits(row.encrypted_payload))
  }
  return {
    name: openedDef.name || '',
    slug: openedDef.slug,
    schema: parseMeasureSchema(openedDef.schema),
    rows: openedEntries.map((row) => {
      const who = names.get(row.client_id)
      const scored = scorePayload(row.encrypted_payload)
      return {
        recordedOn: String(row.recorded_on).slice(0, 10),
        clientName: who?.name || 'Client',
        dob: who?.dob || '',
        gender: who?.gender || '',
        total: scored.total,
        items: scored.items,
      }
    }),
  }
}

export async function createPrivateSubmission(input: {
  formId: string
  clientId: string
  episodeId: string
  organizationId: string | null
}): Promise<{ id: string; token: string }> {
  const { supabase } = await signedIn()
  const { data: form, error } = await supabase
    .from('form_definitions')
    .select('id, version, audience, status, schema, autofill_client, payload_format, sealed_payload')
    .eq('id', input.formId)
    .single()
  rowOrThrow(form, error, 'Could not load that form.')
  if (form.audience !== 'private' || form.status !== 'published') {
    throw new Error('Publish a form for a client you already see before sending it.')
  }
  const [openedForm] = await revealNamed('form_definitions', [form])
  const schema = parseFormSchema(openedForm.schema)
  const autofill = form.autofill_client !== false
  const clientPrefill = async (target: FormSchema) => {
    const { data: identityRow, error: identityError } = await supabase
      .from('client_identities')
      .select('encrypted_payload, payload_format')
      .eq('client_id', input.clientId)
      .maybeSingle()
    throwIf(identityError)
    const [openedIdentity] = identityRow
      ? await withOpenedPayloads('client_identities', [{
        id: input.clientId,
        payload_format: identityRow.payload_format,
        encrypted_payload: identityRow.encrypted_payload,
      }])
      : []
    return prefillClientAnswers(target, clientBinds(openedIdentity?.encrypted_payload ?? identityRow?.encrypted_payload))
  }
  const { data: openRows, error: openError } = await supabase
    .from('form_submissions')
    .select('id, access_token, encrypted_payload, payload_format')
    .eq('form_definition_id', form.id)
    .eq('episode_id', input.episodeId)
    .eq('client_id', input.clientId)
    .eq('status', 'in_progress')
    .limit(1)
  throwIf(openError)
  if (openRows?.[0]) {
    const [open] = await withOpenedPayloads('form_submissions', openRows)
    if (autofill) {
      const payload = asObject(open.encrypted_payload)
      const savedSchema = parseFormSchema(payload.schema ?? form.schema)
      const merged = mergeEmptyClientAnswers(asObject(payload.answers), await clientPrefill(savedSchema))
      if (merged.changed) {
        await sealClinicalRecord('form_submissions', open.id, { ...payload, answers: merged.answers })
      }
    }
    return { id: open.id, token: open.access_token }
  }
  const measureIds = [...new Set(schema.blocks.flatMap((block) => (
    block.type === 'measure' ? [block.measureId] : []
  )))]
  const measures: Record<string, MeasureSchema> = {}
  if (measureIds.length) {
    const { data: defs, error: measureError } = await supabase
      .from('outcome_measure_defs')
      .select('id, schema, payload_format, sealed_payload')
      .in('id', measureIds)
    throwIf(measureError)
    const openedDefs = await revealNamed('outcome_measure_defs', defs || [])
    for (const def of openedDefs) measures[def.id] = parseMeasureSchema(def.schema)
    if (measureIds.some((id) => !measures[id])) throw new Error('A questionnaire on this form is missing.')
  }
  const answers = autofill ? await clientPrefill(schema) : {}
  const created = await createClinicalRecord('form_submissions', {
    form_definition_id: form.id,
    form_version: form.version,
    client_id: input.clientId,
    episode_id: input.episodeId,
    submitted_at: null,
  }, {
    v: 0,
    schema,
    measures,
    answers,
  })
  const { data, error: tokenError } = await supabase
    .from('form_submissions')
    .select('access_token')
    .eq('id', created.id)
    .single()
  rowOrThrow(data, tokenError, 'Could not send the form.')
  return { id: created.id, token: data.access_token }
}

export async function recordMeasureScore(input: {
  measureId: string
  clientId: string
  episodeId: string
  organizationId: string | null
  recordedOn: string
  answer: unknown
}): Promise<void> {
  const { supabase } = await signedIn()
  const { data: def, error } = await supabase
    .from('outcome_measure_defs')
    .select('id, schema, payload_format, sealed_payload')
    .eq('id', input.measureId)
    .single()
  rowOrThrow(def, error, 'Could not load that questionnaire.')
  const [openedDef] = await revealNamed('outcome_measure_defs', [def])
  const schema = parseMeasureSchema(openedDef.schema)
  const scored = scoreMeasure(schema, input.answer)
  await createClinicalRecord('outcome_entries', {
    client_id: input.clientId,
    episode_id: input.episodeId,
    measure_id: input.measureId,
    recorded_on: input.recordedOn,
    completion_status: 'complete',
  }, {
    v: 0,
    total: scored.total,
    items: scored.items,
  })
}

export async function startPublicForm(formId: string): Promise<string> {
  const data = await invokeFormRecord<{ token: string }>('form-start', { formId })
  return data.token
}

export async function openFormLink(token: string): Promise<OpenFormLink> {
  const data = await invokeFormRecord<Record<string, unknown>>('form-open', { token })
  const row = asObject(data)
  const measuresRaw = asObject(row.measures)
  const measures: Record<string, MeasureSchema> = {}
  for (const [id, schema] of Object.entries(measuresRaw)) {
    measures[id] = parseMeasureSchema(schema)
  }
  return {
    title: String(row.title || 'Form'),
    status: String(row.status || ''),
    schema: parseFormSchema(row.schema),
    measures,
    answers: asObject(row.answers),
    letterhead: parseOpenLetterhead(row.letterhead),
  }
}

function parseOpenLetterhead(raw: unknown): OpenFormLink['letterhead'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const practiceName = String(row.practiceName || '')
  const logoUrl = String(row.logoUrl || '')
  const addressLines = Array.isArray(row.addressLines) ? row.addressLines.map((line) => String(line || '')).filter(Boolean) : []
  if (!practiceName && !logoUrl && !addressLines.length && !row.clinicianName) return null
  return {
    practiceName,
    logoUrl,
    addressLines,
    clinicianName: String(row.clinicianName || ''),
    professionalTitle: String(row.professionalTitle || ''),
  }
}

export type FormDocumentRecord = {
  id: string
  clientId: string | null
  title: string
  status: string
  submittedAt: string | null
  schema: FormSchema
  measures: Record<string, MeasureSchema>
  answers: Record<string, unknown>
  letterheadId: string | null
}

export async function getFormDocument(submissionId: string): Promise<FormDocumentRecord> {
  const supabase = supabaseOrThrow()
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, client_id, status, submitted_at, encrypted_payload, payload_format, form_definitions(id, name, letterhead_id, payload_format, sealed_payload)')
    .eq('id', submissionId)
    .single()
  rowOrThrow(data, error, 'Could not open this form.')
  const [opened] = await withOpenedPayloads('form_submissions', [data])
  const payload = asObject(opened.encrypted_payload)
  const measuresRaw = asObject(payload.measures)
  const measures: Record<string, MeasureSchema> = {}
  for (const [id, schema] of Object.entries(measuresRaw)) {
    measures[id] = parseMeasureSchema(schema)
  }
  const linked = one(data.form_definitions as Sealable & { letterhead_id?: string | null } | (Sealable & { letterhead_id?: string | null })[] | null)
  const [definition] = linked?.id ? await revealNamed('form_definitions', [linked]) : []
  return {
    id: data.id,
    clientId: data.client_id,
    title: definition?.name || 'Form',
    status: data.status,
    submittedAt: data.submitted_at,
    schema: parseFormSchema(payload.schema),
    measures,
    answers: asObject(payload.answers),
    letterheadId: definition?.letterhead_id || null,
  }
}

export async function saveFormLink(token: string, answers: Record<string, unknown>): Promise<void> {
  await invokeFormRecord('form-save', { token, answers })
}

export async function submitFormLink(token: string): Promise<void> {
  await invokeFormRecord('form-submit', { token })
}

export async function startOrResumePublicForm(formId: string): Promise<string> {
  const key = `form-start:${formId}`
  const existing = window.sessionStorage.getItem(key)
  if (existing) {
    try {
      const open = await openFormLink(existing)
      if (open.status === 'in_progress') return existing
    } catch {
      window.sessionStorage.removeItem(key)
    }
  }
  const token = await startPublicForm(formId)
  window.sessionStorage.setItem(key, token)
  return token
}
