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
import { getSupabase } from './client'
import type { Json } from './database.types'

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
    .select('id, name, slug, schema, is_active, status')
    .order('name')
  throwIf(error)
  const { data: scores, error: scoreError } = await supabase
    .from('outcome_entries')
    .select('measure_id')
  throwIf(scoreError)
  const used = new Set((scores || []).map((row) => row.measure_id))
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
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
  const { supabase, user } = await signedIn()

  if (input.id) {
    const { count, error: countError } = await supabase
      .from('outcome_entries')
      .select('id', { count: 'exact', head: true })
      .eq('measure_id', input.id)
    throwIf(countError)
    const { data: existing, error: existingError } = await supabase
      .from('outcome_measure_defs')
      .select('schema, slug, status')
      .eq('id', input.id)
      .single()
    rowOrThrow(existing, existingError, 'Could not load that questionnaire.')
    const hasScores = (count || 0) > 0
    if (measureEditIsBlocked(parseMeasureSchema(existing.schema), schema, hasScores)) {
      throw new Error('Scores are already saved. You can change the wording. A new scale needs a new questionnaire.')
    }
    const status: 'draft' | 'published' = (input.publish || existing.status === 'published') ? 'published' : 'draft'
    if (status === 'published') {
      const problem = validateMeasure(name, schema)
      if (problem) throw new Error(problem)
    }
    const { error } = await supabase
      .from('outcome_measure_defs')
      .update({
        name,
        schema: schema as unknown as Json,
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
  const { data, error } = await supabase
    .from('outcome_measure_defs')
    .insert({
      owner_id: user.id,
      name,
      slug,
      schema: schema as unknown as Json,
      is_active: status === 'published',
      status,
    })
    .select('id')
    .single()
  rowOrThrow(data, error, 'Could not save the questionnaire.')
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
    .select('id, name, slug, audience, status, is_onboarding, place_on_screener, autofill_client, letterhead_id, version, schema')
    .neq('status', 'archived')
    .order('name')
  throwIf(error)
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
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
  const { supabase, user } = await signedIn()

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
    const { error } = await supabase
      .from('form_definitions')
      .update({
        name,
        schema: schema as unknown as Json,
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
  const { data, error } = await supabase
    .from('form_definitions')
    .insert({
      owner_id: user.id,
      name,
      slug,
      audience,
      status,
      is_onboarding: audience === 'public',
      place_on_screener: placeOnScreener,
      autofill_client: autofillClient,
      letterhead_id: letterheadId,
      version: 1,
      schema: schema as unknown as Json,
    })
    .select('id, slug, version')
    .single()
  rowOrThrow(data, error, 'Could not save the form.')
  return {
    id: data.id,
    name,
    slug: data.slug,
    audience,
    status,
    is_onboarding: audience === 'public',
    place_on_screener: placeOnScreener,
    autofill_client: autofillClient,
    letterhead_id: letterheadId,
    version: data.version,
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
    .select('id, access_token, status, submitted_at, updated_at, encrypted_payload, form_definitions(name)')
    .eq('episode_id', episodeId)
    .order('updated_at', { ascending: false })
  throwIf(error)
  return (data || []).map((row) => {
    const def = one(row.form_definitions as { name?: string } | { name?: string }[] | null)
    return {
      id: row.id,
      token: row.access_token,
      name: def?.name || 'Form',
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
    .select('id, measure_id, recorded_on, encrypted_payload, outcome_measure_defs(name, schema)')
    .eq('episode_id', episodeId)
    .eq('completion_status', 'complete')
    .order('recorded_on', { ascending: false })
  throwIf(error)
  return (data || []).map((row) => {
    const def = one(row.outcome_measure_defs as { name?: string; schema?: Json } | { name?: string; schema?: Json }[] | null)
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
    .select('name, slug, schema')
    .eq('id', measureId)
    .single()
  rowOrThrow(def, error, 'Could not load that questionnaire.')
  let query = supabase
    .from('outcome_entries')
    .select('recorded_on, encrypted_payload, client_id')
    .eq('measure_id', measureId)
    .eq('completion_status', 'complete')
  if (clientId) query = query.eq('client_id', clientId)
  const { data: entries, error: entryError } = await query
  throwIf(entryError)
  const ids = [...new Set((entries || []).map((row) => row.client_id))]
  const names = new Map<string, ReturnType<typeof identityBits>>()
  if (ids.length) {
    const { data: identities, error: identityError } = await supabase
      .from('client_identities')
      .select('client_id, encrypted_payload')
      .in('client_id', ids)
    throwIf(identityError)
    for (const row of identities || []) names.set(row.client_id, identityBits(row.encrypted_payload))
  }
  return {
    name: def.name,
    slug: def.slug,
    schema: parseMeasureSchema(def.schema),
    rows: (entries || []).map((row) => {
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
  const { supabase, user } = await signedIn()
  const { data: form, error } = await supabase
    .from('form_definitions')
    .select('id, version, audience, status, schema, autofill_client')
    .eq('id', input.formId)
    .single()
  rowOrThrow(form, error, 'Could not load that form.')
  if (form.audience !== 'private' || form.status !== 'published') {
    throw new Error('Publish a form for a client you already see before sending it.')
  }
  const schema = parseFormSchema(form.schema)
  const autofill = form.autofill_client !== false
  const clientPrefill = async (target: FormSchema) => {
    const { data: identityRow, error: identityError } = await supabase
      .from('client_identities')
      .select('encrypted_payload')
      .eq('client_id', input.clientId)
      .maybeSingle()
    throwIf(identityError)
    return prefillClientAnswers(target, clientBinds(identityRow?.encrypted_payload))
  }
  const { data: openRows, error: openError } = await supabase
    .from('form_submissions')
    .select('id, access_token, encrypted_payload')
    .eq('form_definition_id', form.id)
    .eq('episode_id', input.episodeId)
    .eq('client_id', input.clientId)
    .eq('status', 'in_progress')
    .limit(1)
  throwIf(openError)
  if (openRows?.[0]) {
    const open = openRows[0]
    if (autofill) {
      const payload = asObject(open.encrypted_payload)
      const savedSchema = parseFormSchema(payload.schema ?? form.schema)
      const merged = mergeEmptyClientAnswers(asObject(payload.answers), await clientPrefill(savedSchema))
      if (merged.changed) {
        const { error: updateError } = await supabase
          .from('form_submissions')
          .update({
            encrypted_payload: { ...payload, answers: merged.answers } as unknown as Json,
          })
          .eq('id', open.id)
        throwIf(updateError)
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
      .select('id, schema')
      .in('id', measureIds)
    throwIf(measureError)
    for (const def of defs || []) measures[def.id] = parseMeasureSchema(def.schema)
    if (measureIds.some((id) => !measures[id])) throw new Error('A questionnaire on this form is missing.')
  }
  const answers = autofill ? await clientPrefill(schema) : {}
  const { data, error: insertError } = await supabase
    .from('form_submissions')
    .insert({
      owner_id: user.id,
      organization_id: input.organizationId,
      form_definition_id: form.id,
      form_version: form.version,
      client_id: input.clientId,
      episode_id: input.episodeId,
      status: 'in_progress',
      submitted_at: null,
      encrypted_payload: {
        v: 0,
        schema,
        measures,
        answers,
      } as unknown as Json,
    })
    .select('id, access_token')
    .single()
  rowOrThrow(data, insertError, 'Could not send the form.')
  return { id: data.id, token: data.access_token }
}

export async function recordMeasureScore(input: {
  measureId: string
  clientId: string
  episodeId: string
  organizationId: string | null
  recordedOn: string
  answer: unknown
}): Promise<void> {
  const { supabase, user } = await signedIn()
  const { data: def, error } = await supabase
    .from('outcome_measure_defs')
    .select('schema')
    .eq('id', input.measureId)
    .single()
  rowOrThrow(def, error, 'Could not load that questionnaire.')
  const schema = parseMeasureSchema(def.schema)
  const scored = scoreMeasure(schema, input.answer)
  const { error: insertError } = await supabase.from('outcome_entries').insert({
    owner_id: user.id,
    organization_id: input.organizationId,
    client_id: input.clientId,
    episode_id: input.episodeId,
    measure_id: input.measureId,
    recorded_on: input.recordedOn,
    completion_status: 'complete',
    encrypted_payload: {
      v: 0,
      total: scored.total,
      items: scored.items,
    } as unknown as Json,
  })
  throwIf(insertError)
}

export async function startPublicForm(formId: string): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('This form is not available.')
  const { data, error } = await supabase.rpc('form_public_start', { form_id: formId })
  if (error) throw cleanError(error)
  return data
}

export async function openFormLink(token: string): Promise<OpenFormLink> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('This link does not open a form.')
  const { data, error } = await supabase.rpc('form_link_open', { token })
  if (error) throw cleanError(error)
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
    .select('id, client_id, status, submitted_at, encrypted_payload, form_definitions(name, letterhead_id)')
    .eq('id', submissionId)
    .single()
  rowOrThrow(data, error, 'Could not open this form.')
  const payload = asObject(data.encrypted_payload)
  const measuresRaw = asObject(payload.measures)
  const measures: Record<string, MeasureSchema> = {}
  for (const [id, schema] of Object.entries(measuresRaw)) {
    measures[id] = parseMeasureSchema(schema)
  }
  const definition = one(data.form_definitions as { name?: string; letterhead_id?: string | null } | { name?: string; letterhead_id?: string | null }[] | null)
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
  const supabase = getSupabase()
  if (!supabase) throw new Error('These answers could not be saved.')
  const { error } = await supabase.rpc('form_link_save', {
    token,
    answers: answers as Json,
  })
  if (error) throw cleanError(error)
}

export async function submitFormLink(token: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('This form could not be sent.')
  const { error } = await supabase.rpc('form_link_submit', { token })
  if (error) throw cleanError(error)
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
