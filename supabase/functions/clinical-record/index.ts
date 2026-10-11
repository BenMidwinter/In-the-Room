import { decryptDataKey, generateDataKey, kmsKeyId } from '../_shared/awsKms.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { importDek, openJson, sealJson } from '../_shared/envelope.ts'
import { adminClient, userClient } from '../_shared/supabaseAdmin.ts'

const TABLES = new Set(['progress_notes', 'letters', 'reports', 'form_submissions', 'outcome_entries'])
const OPEN_LIMIT = 80
const CLINICAL_LIMIT = 1_500_000

const CREATE_COLUMNS: Record<string, string[]> = {
  progress_notes: ['client_id', 'episode_id', 'appointment_id', 'session_date', 'template_id', 'note_number', 'noted_at'],
  letters: ['client_id', 'episode_id', 'letter_date', 'template_id'],
  reports: ['client_id', 'episode_id', 'report_date', 'template_id'],
  form_submissions: ['form_definition_id', 'form_version', 'client_id', 'episode_id', 'status', 'submitted_at'],
  outcome_entries: ['client_id', 'episode_id', 'appointment_id', 'measure_id', 'recorded_on', 'completion_status'],
}

const dekCache = new Map<string, { key: CryptoKey; exp: number }>()

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function assertClinical(role: string) {
  if (role === 'practice_manager') {
    throw new Error('This account cannot open clinical records.')
  }
}

async function dekFor(admin: ReturnType<typeof adminClient>, organizationId: string): Promise<CryptoKey> {
  const hit = dekCache.get(organizationId)
  if (hit && hit.exp > Date.now()) return hit.key
  const { data, error } = await admin
    .from('organization_keys')
    .select('wrapped_dek')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error || !data?.wrapped_dek) throw new Error('The practice key could not be opened.')
  const key = await importDek(await decryptDataKey(String(data.wrapped_dek)))
  dekCache.set(organizationId, { key, exp: Date.now() + 10 * 60 * 1000 })
  return key
}

async function ensureOrg(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data: member, error } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (member?.organization_id) {
    return { organizationId: String(member.organization_id), role: String(member.role) }
  }

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: 'Practice' })
    .select('id')
    .single()
  if (orgError || !org) throw new Error(orgError?.message || 'Could not open the practice.')

  try {
    const { wrapped } = await generateDataKey()
    const { error: keyError } = await admin.from('organization_keys').insert({
      organization_id: org.id,
      wrapped_dek: wrapped,
      kms_key_id: kmsKeyId(),
    })
    if (keyError) throw new Error(keyError.message)
    const { error: memberError } = await admin.from('organization_members').insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })
    if (memberError) throw new Error(memberError.message)
  } catch (err) {
    await admin.from('organizations').delete().eq('id', org.id)
    throw err
  }
  return { organizationId: String(org.id), role: 'owner' }
}

function pickedRow(
  table: string,
  row: Record<string, unknown>,
  userId: string,
  organizationId: string,
  envelope: Record<string, string | number>,
) {
  const out: Record<string, unknown> = {
    owner_id: userId,
    organization_id: organizationId,
    encrypted_payload: envelope,
    payload_format: 'envelope',
  }
  for (const key of CREATE_COLUMNS[table] || []) {
    if (row[key] !== undefined) out[key] = row[key]
  }
  if (table === 'progress_notes' || table === 'letters' || table === 'reports') {
    out.author_id = userId
  }
  if (table === 'progress_notes') out.status = 'draft'
  if (table === 'form_submissions') out.status = 'in_progress'
  return out
}

async function plainOf(
  admin: ReturnType<typeof adminClient>,
  row: { owner_id: string; organization_id: string | null; payload_format: string; encrypted_payload: unknown },
) {
  if (row.payload_format === 'envelope') {
    const organizationId = row.organization_id || (await ensureOrg(admin, row.owner_id)).organizationId
    const opened = await openJson(await dekFor(admin, organizationId), asObject(row.encrypted_payload))
    return asObject(opened)
  }
  return asObject(row.encrypted_payload)
}

async function letterheadFor(admin: ReturnType<typeof adminClient>, formDefinitionId: string) {
  const { data: form } = await admin
    .from('form_definitions')
    .select('name, letterhead_id, owner_id')
    .eq('id', formDefinitionId)
    .maybeSingle()
  if (!form) return { title: 'Form', letterhead: null }
  if (!form.letterhead_id) return { title: form.name || 'Form', letterhead: null }
  const [{ data: letterhead }, { data: profile }] = await Promise.all([
    admin
      .from('letterheads')
      .select('practice_name, name, logo_url, address_line1, address_line2, address_line3, postcode, country')
      .eq('id', form.letterhead_id)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('display_name, professional_title')
      .eq('id', form.owner_id)
      .maybeSingle(),
  ])
  const addressLines = [
    letterhead?.address_line1,
    letterhead?.address_line2,
    letterhead?.address_line3,
    letterhead?.postcode,
    letterhead?.country,
  ].map((line) => String(line || '').trim()).filter(Boolean)
  return {
    title: form.name || 'Form',
    letterhead: {
      practiceName: letterhead?.practice_name || letterhead?.name || '',
      logoUrl: letterhead?.logo_url || '',
      clinicianName: profile?.display_name || '',
      professionalTitle: profile?.professional_title || '',
      addressLines,
    },
  }
}

async function loadForm(admin: ReturnType<typeof adminClient>, token: unknown) {
  if (!isUuid(token)) throw new Error('This link does not open a form.')
  const { data, error } = await admin
    .from('form_submissions')
    .select('id, owner_id, organization_id, form_definition_id, status, client_id, episode_id, encrypted_payload, payload_format')
    .eq('access_token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('This link does not open a form.')
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '')
    const admin = adminClient()

    if (action === 'form-start') {
      const formId = body.formId
      if (!isUuid(formId)) return jsonResponse({ error: 'This form is not available.' }, 400)
      const { data: form, error } = await admin
        .from('form_definitions')
        .select('id, owner_id, version, schema, status, audience')
        .eq('id', formId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!form || form.status !== 'published' || form.audience !== 'public') {
        return jsonResponse({ error: 'This form is not available.' }, 400)
      }
      const org = await ensureOrg(admin, form.owner_id)
      const schema = asObject(form.schema)
      const blocks = Array.isArray(schema.blocks) ? schema.blocks : []
      if (blocks.length > 200) return jsonResponse({ error: 'This form is not available.' }, 400)
      const measureIds = [...new Set(blocks.flatMap((block) => {
        const row = asObject(block)
        return row.type === 'measure' && isUuid(row.measureId) ? [String(row.measureId)] : []
      }))]
      const measures: Record<string, unknown> = {}
      if (measureIds.length) {
        const { data: defs, error: measureError } = await admin
          .from('outcome_measure_defs')
          .select('id, schema')
          .in('id', measureIds)
          .eq('owner_id', form.owner_id)
        if (measureError) throw new Error(measureError.message)
        for (const def of defs || []) measures[def.id] = def.schema
      }
      const sealed = await sealJson(await dekFor(admin, org.organizationId), {
        v: 0,
        schema,
        measures,
        answers: {},
      })
      const { data: created, error: insertError } = await admin
        .from('form_submissions')
        .insert({
          owner_id: form.owner_id,
          organization_id: org.organizationId,
          form_definition_id: form.id,
          form_version: form.version,
          status: 'in_progress',
          submitted_at: null,
          encrypted_payload: sealed,
          payload_format: 'envelope',
        })
        .select('access_token')
        .single()
      if (insertError || !created) throw new Error(insertError?.message || 'This form is not available.')
      return jsonResponse({ token: created.access_token })
    }

    if (action === 'form-open' || action === 'form-save' || action === 'form-submit') {
      const row = await loadForm(admin, body.token)
      const plain = await plainOf(admin, row)
      if (action === 'form-open') {
        const chrome = await letterheadFor(admin, row.form_definition_id)
        return jsonResponse({
          title: chrome.title,
          status: row.status,
          schema: plain.schema ?? { v: 1, blocks: [] },
          measures: plain.measures ?? {},
          answers: plain.answers ?? {},
          letterhead: chrome.letterhead,
        })
      }
      if (row.status !== 'in_progress') {
        if (action === 'form-submit' && row.status === 'submitted') return jsonResponse({ status: 'submitted' })
        return jsonResponse({ error: 'This form can no longer be changed.' }, 400)
      }
      const org = await ensureOrg(admin, row.owner_id)
      const key = await dekFor(admin, org.organizationId)
      if (action === 'form-save') {
        const answers = body.answers
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
          return jsonResponse({ error: 'These answers could not be saved.' }, 400)
        }
        if (JSON.stringify(answers).length > 500_000) {
          return jsonResponse({ error: 'This form is too large to save.' }, 400)
        }
        plain.answers = answers
        const sealed = await sealJson(key, plain)
        const { error } = await admin.from('form_submissions').update({
          encrypted_payload: sealed,
          payload_format: 'envelope',
          organization_id: row.organization_id || org.organizationId,
        }).eq('id', row.id)
        if (error) throw new Error(error.message)
        return jsonResponse({ ok: true })
      }

      const { data: definition } = await admin
        .from('form_definitions')
        .select('place_on_screener')
        .eq('id', row.form_definition_id)
        .maybeSingle()
      const blocks = Array.isArray(asObject(plain.schema).blocks) ? asObject(plain.schema).blocks as unknown[] : []
      const measures = asObject(plain.measures)
      const answers = asObject(plain.answers)
      const scoreMeasures = Boolean(row.client_id) || Boolean(definition?.place_on_screener)
      const envelopes: Record<string, unknown> = {}
      if (scoreMeasures) {
        for (const block of blocks) {
          const item = asObject(block)
          if (item.type !== 'measure' || !isUuid(item.measureId)) continue
          const measureId = String(item.measureId)
          const { data: scored, error: scoreError } = await admin.rpc('form_score_measure', {
            measure_schema: measures[measureId] ?? null,
            answer: answers[String(item.id || '')] ?? null,
          })
          if (scoreError) throw new Error(scoreError.message)
          const score = asObject(scored)
          envelopes[measureId] = await sealJson(key, {
            v: 0,
            total: score.total ?? 0,
            items: score.items ?? {},
            submission_id: row.id,
          })
        }
      }
      const sealed = await sealJson(key, plain)
      const { data, error } = await admin.rpc('form_link_commit_sealed', {
        token: body.token,
        plain_payload: plain,
        sealed_payload: sealed,
        outcome_envelopes: envelopes,
      })
      if (error) throw new Error(error.message)
      return jsonResponse(data || { status: 'submitted' })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const table = String(body.table || '')
    if (!TABLES.has(table)) return jsonResponse({ error: 'That record cannot be sealed.' }, 400)
    const org = await ensureOrg(admin, user.id)
    assertClinical(org.role)

    if (action === 'open') {
      const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid) : []
      if (!ids.length) return jsonResponse({ records: [] })
      if (ids.length > OPEN_LIMIT) return jsonResponse({ error: 'Open fewer records at once.' }, 400)
      const { data, error } = await supabase
        .from(table)
        .select('id, payload_format, encrypted_payload')
        .in('id', ids)
      if (error) throw new Error(error.message)
      const key = (data || []).some((row) => row.payload_format === 'envelope')
        ? await dekFor(admin, org.organizationId)
        : null
      const records = []
      for (const row of data || []) {
        const payload = row.payload_format === 'envelope' && key
          ? await openJson(key, asObject(row.encrypted_payload))
          : row.encrypted_payload
        records.push({ id: row.id, payload })
      }
      return jsonResponse({ records })
    }

    const payloadText = JSON.stringify(body.payload ?? null)
    if (payloadText.length > CLINICAL_LIMIT) {
      return jsonResponse({ error: 'This record is too large to seal.' }, 400)
    }
    const key = await dekFor(admin, org.organizationId)
    const envelope = await sealJson(key, body.payload ?? {})

    if (action === 'seal') {
      if (!isUuid(body.id)) return jsonResponse({ error: 'That record could not be sealed.' }, 400)
      const { data, error } = await supabase
        .from(table)
        .update({
          encrypted_payload: envelope,
          payload_format: 'envelope',
          organization_id: org.organizationId,
        })
        .eq('id', body.id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return jsonResponse({ error: 'That record could not be sealed.' }, 404)
      return jsonResponse({ id: data.id, payload_format: 'envelope' })
    }

    if (action === 'create') {
      const row = pickedRow(table, asObject(body.row), user.id, org.organizationId, envelope)
      const { data, error } = await supabase.from(table).insert(row).select('id').single()
      if (error || !data) throw new Error(error?.message || 'That record could not be sealed.')
      return jsonResponse({ id: data.id, payload_format: 'envelope' })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The record could not be sealed.'
    return jsonResponse({ error: message }, 400)
  }
})
