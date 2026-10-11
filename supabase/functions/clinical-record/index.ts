import { generateDataKey, kmsKeyId } from '../_shared/awsKms.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { openJson, sealJson } from '../_shared/envelope.ts'
import { asObject, dekFor } from '../_shared/practiceKey.ts'
import { adminClient, userClient } from '../_shared/supabaseAdmin.ts'

const OPEN_LIMIT = 80
const CLINICAL_LIMIT = 1_500_000

type TableSpec = {
  key: 'id' | 'client_id'
  payload: string
  format: string
  org: boolean
  owner: boolean
  author: boolean
  create: string[]
  defaults: Record<string, unknown>
  clear: Record<string, unknown>
}

const SPECS: Record<string, TableSpec> = {
  progress_notes: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: true, create: ['client_id', 'episode_id', 'appointment_id', 'session_date', 'template_id', 'note_number', 'noted_at'], defaults: { status: 'draft' }, clear: {} },
  letters: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: true, create: ['client_id', 'episode_id', 'letter_date', 'template_id'], defaults: {}, clear: {} },
  reports: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: true, create: ['client_id', 'episode_id', 'report_date', 'template_id'], defaults: {}, clear: {} },
  form_submissions: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['form_definition_id', 'form_version', 'client_id', 'episode_id', 'submitted_at'], defaults: { status: 'in_progress' }, clear: {} },
  outcome_entries: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id', 'episode_id', 'appointment_id', 'measure_id', 'recorded_on', 'completion_status'], defaults: {}, clear: {} },
  clients: { key: 'id', payload: 'encrypted_pseudonym', format: 'payload_format', org: true, owner: true, author: false, create: ['status', 'concession_kind', 'concession_percent', 'concession_pence'], defaults: {}, clear: { concession_label: null } },
  client_identities: { key: 'client_id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id'], defaults: {}, clear: {} },
  client_clinical_profiles: { key: 'client_id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id'], defaults: {}, clear: {} },
  contacts: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id', 'role', 'is_billing_contact', 'is_primary'], defaults: {}, clear: {} },
  episodes: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id', 'episode_number', 'status', 'referral_date', 'start_date', 'end_date'], defaults: {}, clear: {} },
  appointments: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id', 'clinician_id', 'episode_id', 'service_id', 'appointment_type', 'starts_at', 'ends_at', 'attendance_status', 'do_not_invoice', 'charged_pence', 'fee_override_pence', 'block_role', 'series_id', 'parent_appointment_id'], defaults: {}, clear: {} },
  timeline_events: { key: 'id', payload: 'encrypted_summary', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id', 'episode_id', 'event_date', 'occurred_at', 'event_type', 'ref_table', 'ref_id', 'actor_id'], defaults: {}, clear: {} },
  templates: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['kind', 'is_active'], defaults: {}, clear: { name: 'Template', description: null } },
  working_documents: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: true, create: ['client_id', 'episode_id', 'template_id'], defaults: {}, clear: {} },
  journal_entries: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: true, owner: true, author: true, create: ['entry_date', 'somatic_state'], defaults: {}, clear: {} },
  practice_items: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: false, owner: true, author: false, create: ['parent_id', 'kind'], defaults: {}, clear: { name: 'Item' } },
  cpd_entries: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: false, owner: true, author: false, create: ['occurred_on', 'minutes', 'label'], defaults: {}, clear: {} },
  supervision_entries: { key: 'id', payload: 'encrypted_payload', format: 'payload_format', org: false, owner: true, author: false, create: ['occurred_on', 'minutes', 'label', 'direction'], defaults: {}, clear: {} },
  waitlist_placements: { key: 'client_id', payload: 'sealed_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['client_id', 'service_id'], defaults: {}, clear: { preferred_times: '', information: '' } },
  tags: { key: 'id', payload: 'sealed_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['kind', 'name', 'color'], defaults: {}, clear: {} },
  invoices: { key: 'id', payload: 'sealed_payload', format: 'payload_format', org: false, owner: true, author: false, create: ['client_id', 'number', 'status', 'issued_on', 'due_on', 'total_pence', 'sent_at', 'delivery_method', 'resend_batch_id', 'last_delivery_error'], defaults: {}, clear: { bill_to_name: '', bill_to_email: '', for_name: '', recipient_email: '', payment_details: '' } },
  invoice_lines: { key: 'id', payload: 'sealed_payload', format: 'payload_format', org: false, owner: true, author: false, create: ['invoice_id', 'appointment_id', 'position', 'session_date', 'unit_pence', 'quantity', 'includes_vat', 'released_at'], defaults: {}, clear: { description: '' } },
  invoice_payments: { key: 'id', payload: 'sealed_payload', format: 'payload_format', org: false, owner: true, author: false, create: ['invoice_id', 'amount_pence', 'paid_on'], defaults: {}, clear: { note: '' } },
  form_definitions: { key: 'id', payload: 'sealed_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['slug', 'audience', 'status', 'version', 'is_onboarding', 'place_on_screener', 'autofill_client', 'letterhead_id'], defaults: {}, clear: { name: '', description: '', schema: { v: 1, blocks: [] } } },
  outcome_measure_defs: { key: 'id', payload: 'sealed_payload', format: 'payload_format', org: true, owner: true, author: false, create: ['slug', 'is_active', 'status'], defaults: {}, clear: { name: '', schema: {} } },
  profiles: { key: 'id', payload: 'sealed_bank', format: 'bank_format', org: false, owner: false, author: false, create: [], defaults: {}, clear: { invoice_account_name: null, invoice_sort_code: null, invoice_account_number: null, invoice_payment_note: null } },
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function assertClinical(role: string) {
  if (role === 'practice_manager') {
    throw new Error('This account cannot open clinical records.')
  }
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
  spec: TableSpec,
  row: Record<string, unknown>,
  userId: string,
  organizationId: string,
  envelope: Record<string, string | number>,
) {
  const out: Record<string, unknown> = {
    [spec.payload]: envelope,
    [spec.format]: 'envelope',
    ...spec.clear,
  }
  if (spec.owner) out.owner_id = userId
  if (spec.org) out.organization_id = organizationId
  if (spec.author) out.author_id = userId
  for (const key of spec.create) {
    if (row[key] !== undefined) out[key] = row[key]
  }
  Object.assign(out, spec.defaults)
  return out
}

function clientPatch(plain: Record<string, unknown>) {
  const schema = asObject(plain.schema)
  const blocks = Array.isArray(schema.blocks) ? schema.blocks : []
  const answers = asObject(plain.answers)
  const patch: Record<string, string> = {}
  for (const block of blocks) {
    const item = asObject(block)
    if (item.type !== 'client') continue
    const bind = String(item.bind || '')
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(bind)) continue
    const val = typeof answers[String(item.id || '')] === 'string'
      ? String(answers[String(item.id || '')]).trim()
      : ''
    if (val) patch[bind] = val.slice(0, 4000)
  }
  return patch
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
    .select('name, letterhead_id, owner_id, payload_format, sealed_payload')
    .eq('id', formDefinitionId)
    .maybeSingle()
  if (!form) return { title: 'Form', letterhead: null }
  let title = form.name || 'Form'
  if (form.payload_format === 'envelope') {
    const org = await ensureOrg(admin, form.owner_id)
    const body = asObject(await openJson(await dekFor(admin, org.organizationId), asObject(form.sealed_payload)))
    title = String(body.name || 'Form')
  }
  if (!form.letterhead_id) return { title, letterhead: null }
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
    title,
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
        .select('id, owner_id, version, schema, status, audience, payload_format, sealed_payload')
        .eq('id', formId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!form || form.status !== 'published' || form.audience !== 'public') {
        return jsonResponse({ error: 'This form is not available.' }, 400)
      }
      const org = await ensureOrg(admin, form.owner_id)
      const key = await dekFor(admin, org.organizationId)
      const schema = form.payload_format === 'envelope'
        ? asObject(asObject(await openJson(key, asObject(form.sealed_payload))).schema)
        : asObject(form.schema)
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
          .select('id, schema, payload_format, sealed_payload')
          .in('id', measureIds)
          .eq('owner_id', form.owner_id)
        if (measureError) throw new Error(measureError.message)
        for (const def of defs || []) {
          measures[def.id] = def.payload_format === 'envelope'
            ? asObject(await openJson(key, asObject(def.sealed_payload))).schema
            : def.schema
        }
      }
      const sealed = await sealJson(key, {
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
      const patch = clientPatch(plain)
      const creating = !row.client_id && Boolean(definition?.place_on_screener)
      let sealedIdentity: Record<string, string | number> | null = null
      let sealedPseudonym: Record<string, string | number> | null = null
      let sealedEpisode: Record<string, string | number> | null = null
      if (creating || (row.client_id && Object.keys(patch).length)) {
        let current: Record<string, unknown> = {}
        if (row.client_id) {
          const { data: identity, error: identityError } = await admin
            .from('client_identities')
            .select('encrypted_payload, payload_format')
            .eq('client_id', row.client_id)
            .maybeSingle()
          if (identityError) throw new Error(identityError.message)
          if (identity) {
            current = identity.payload_format === 'envelope'
              ? asObject(await openJson(key, asObject(identity.encrypted_payload)))
              : asObject(identity.encrypted_payload)
          }
        }
        const firstName = String(patch.first_name || current.first_name || (creating ? 'New' : ''))
        const surname = String(patch.surname || current.surname || (creating ? 'referral' : ''))
        sealedIdentity = await sealJson(key, {
          ...current,
          ...patch,
          v: 0,
          first_name: firstName,
          surname,
        })
        if (creating || patch.first_name || patch.surname) {
          let pseudo: Record<string, unknown> = {}
          if (row.client_id) {
            const { data: client, error: clientError } = await admin
              .from('clients')
              .select('encrypted_pseudonym, payload_format')
              .eq('id', row.client_id)
              .maybeSingle()
            if (clientError) throw new Error(clientError.message)
            pseudo = client?.payload_format === 'envelope'
              ? asObject(await openJson(key, asObject(client.encrypted_pseudonym)))
              : asObject(client?.encrypted_pseudonym)
          }
          sealedPseudonym = await sealJson(key, {
            ...pseudo,
            v: 0,
            label: `${firstName} ${surname.charAt(0)}.`.trim(),
          })
        }
        if (creating) sealedEpisode = await sealJson(key, { v: 0 })
      }
      const { data, error } = await admin.rpc('form_link_commit_sealed', {
        token: body.token,
        plain_payload: plain,
        sealed_payload: sealed,
        outcome_envelopes: envelopes,
        sealed_identity: sealedIdentity,
        sealed_pseudonym: sealedPseudonym,
        sealed_episode: sealedEpisode,
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
    const spec = SPECS[table]
    if (!spec) return jsonResponse({ error: 'That record cannot be sealed.' }, 400)
    const org = await ensureOrg(admin, user.id)
    assertClinical(org.role)

    if (action === 'open') {
      const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid) : []
      if (!ids.length) return jsonResponse({ records: [] })
      if (ids.length > OPEN_LIMIT) return jsonResponse({ error: 'Open fewer records at once.' }, 400)
      const { data, error } = await supabase
        .from(table)
        .select(`${spec.key}, ${spec.format}, ${spec.payload}`)
        .in(spec.key, ids)
      if (error) throw new Error(error.message)
      const key = (data || []).some((row) => row[spec.format] === 'envelope')
        ? await dekFor(admin, org.organizationId)
        : null
      const records = []
      for (const row of data || []) {
        const stored = row[spec.payload]
        const payload = row[spec.format] === 'envelope' && key
          ? await openJson(key, asObject(stored))
          : stored
        records.push({ id: row[spec.key], payload })
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
      const patch: Record<string, unknown> = {
        [spec.payload]: envelope,
        [spec.format]: 'envelope',
        ...spec.clear,
      }
      if (spec.org) patch.organization_id = org.organizationId
      const { data, error } = await supabase
        .from(table)
        .update(patch)
        .eq(spec.key, body.id)
        .select(spec.key)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return jsonResponse({ error: 'That record could not be sealed.' }, 404)
      return jsonResponse({ id: data[spec.key], payload_format: 'envelope' })
    }

    if (action === 'create') {
      const row = pickedRow(spec, asObject(body.row), user.id, org.organizationId, envelope)
      const { data, error } = await supabase.from(table).insert(row).select(spec.key).single()
      if (error || !data) throw new Error(error?.message || 'That record could not be sealed.')
      return jsonResponse({ id: data[spec.key], payload_format: 'envelope' })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The record could not be sealed.'
    return jsonResponse({ error: message }, 400)
  }
})
