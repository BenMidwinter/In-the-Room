import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { allowedGroups, buildExportArchive } from '../_shared/exportBundle.ts'
import { secret } from '../_shared/secrets.ts'
import { deleteExportObject, getExportObject, putExportObject } from '../_shared/s3.ts'
import { sendResendEmail } from '../_shared/resend.ts'
import { adminClient, userClient } from '../_shared/supabaseAdmin.ts'

const DAY_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'download') return await downloadExport(String(body.token || ''))

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
    const admin = adminClient()

    if (body.action === 'list') return jsonResponse({ exports: await listExports(admin, user.id) })
    if (body.action === 'request') return await requestExport(admin, user, body)
    return jsonResponse({ error: 'That export action is not available.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not export these records.'
    return jsonResponse({ error: message }, 500)
  }
})

async function requestExport(
  admin: ReturnType<typeof adminClient>,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  const scope = body.scope === 'practice' ? 'practice' : body.scope === 'client' ? 'client' : ''
  if (!scope) return jsonResponse({ error: 'Choose a client export or a practice export.' }, 400)
  const clientId = scope === 'client' && isUuid(body.clientId) ? String(body.clientId) : null
  if (scope === 'client' && !clientId) return jsonResponse({ error: 'Choose a client to export.' }, 400)
  const include = Array.isArray(body.include)
    ? [...new Set(body.include.filter((item): item is string => typeof item === 'string' && allowedGroups(scope).includes(item)))]
    : []
  if (!include.length) return jsonResponse({ error: 'Choose at least one part of the record.' }, 400)
  const dateFrom = dateOrNull(body.dateFrom)
  const dateTo = dateOrNull(body.dateTo)
  if (!user.email) return jsonResponse({ error: 'This account has no email address for the export link.' }, 400)

  const { data, error } = await admin.from('data_exports').insert({
    owner_id: user.id,
    scope,
    client_id: clientId,
    include,
    date_from: scope === 'practice' ? dateFrom : null,
    date_to: scope === 'practice' ? dateTo : null,
    status: 'preparing',
  }).select('id').single()
  if (error || !data) return jsonResponse({ error: error?.message || 'The export could not be requested.' }, 400)

  await writeAudit(admin, {
    ownerId: user.id,
    action: 'export.requested',
    exportId: data.id,
    clientId,
    metadata: { scope, include },
  })

  const work = prepareExport(admin, {
    id: data.id,
    userId: user.id,
    email: user.email,
    scope,
    clientId,
    include,
    dateFrom: scope === 'practice' ? dateFrom : null,
    dateTo: scope === 'practice' ? dateTo : null,
  })
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work
  return jsonResponse({ id: data.id, status: 'preparing' })
}

async function prepareExport(
  admin: ReturnType<typeof adminClient>,
  input: {
    id: string
    userId: string
    email: string
    scope: 'client' | 'practice'
    clientId: string | null
    include: string[]
    dateFrom: string | null
    dateTo: string | null
  },
) {
  const key = `exports/${input.userId}/${input.id}.zip`
  try {
    const zip = await buildExportArchive(admin, input)
    await putExportObject(key, zip)
    const token = randomToken()
    const tokenHash = await sha256Hex(token)
    const readyAt = new Date()
    const expiresAt = new Date(readyAt.getTime() + DAY_MS)
    const site = (secret('SITE_URL') || '').replace(/\/$/, '')
    if (!site) throw new Error('The export link is not configured.')
    const link = `${site}/export/${token}`
    await sendResendEmail({
      to: input.email,
      subject: 'Your Process&Note export is ready',
      html: exportEmail(link),
      idempotencyKey: `export-${input.id}`,
    })
    const { error } = await admin.from('data_exports').update({
      status: 'emailed',
      token_hash: tokenHash,
      s3_key: key,
      ready_at: readyAt.toISOString(),
      emailed_at: readyAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      error_message: null,
    }).eq('id', input.id)
    if (error) throw new Error(error.message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The export could not be prepared.'
    await deleteExportObject(key).catch(() => undefined)
    await admin.from('data_exports').update({
      status: 'failed',
      error_message: message.slice(0, 500),
      s3_key: null,
      token_hash: null,
    }).eq('id', input.id)
    console.error('export prepare', message)
  }
}

async function listExports(admin: ReturnType<typeof adminClient>, userId: string) {
  const now = new Date().toISOString()
  const { data: due } = await admin
    .from('data_exports')
    .select('id, s3_key')
    .eq('owner_id', userId)
    .eq('status', 'emailed')
    .lt('expires_at', now)
  for (const row of due || []) {
    if (row.s3_key) await deleteExportObject(String(row.s3_key)).catch(() => undefined)
    await admin.from('data_exports').update({
      status: 'expired',
      s3_key: null,
      token_hash: null,
    }).eq('id', row.id)
  }
  const { data, error } = await admin
    .from('data_exports')
    .select('id, scope, client_id, status, created_at, emailed_at, expires_at, error_message, include')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return data || []
}

async function downloadExport(token: string): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(token)) return jsonResponse({ error: 'This download link is not valid.' }, 400)
  const admin = adminClient()
  const tokenHash = await sha256Hex(token)
  const { data: row, error } = await admin
    .from('data_exports')
    .select('id, owner_id, client_id, status, s3_key, expires_at, downloaded_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) return jsonResponse({ error: error.message }, 400)
  if (!row || row.status !== 'emailed' || !row.s3_key) {
    return jsonResponse({ error: 'This download is no longer available.' }, 410)
  }
  if (row.downloaded_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) {
    await expireExport(admin, row.id, row.s3_key)
    return jsonResponse({ error: 'This download has expired.' }, 410)
  }

  const { data: claimed } = await admin
    .from('data_exports')
    .update({ downloaded_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('downloaded_at', null)
    .eq('status', 'emailed')
    .select('id')
    .maybeSingle()
  if (!claimed) return jsonResponse({ error: 'This download has already been used.' }, 410)

  try {
    const bytes = await getExportObject(String(row.s3_key))
    await deleteExportObject(String(row.s3_key)).catch(() => undefined)
    await admin.from('data_exports').update({
      status: 'expired',
      s3_key: null,
      token_hash: null,
    }).eq('id', row.id)
    await writeAudit(admin, {
      ownerId: row.owner_id,
      action: 'export.downloaded',
      exportId: row.id,
      clientId: row.client_id,
      metadata: {},
    })
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="process-and-note-export.zip"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    await admin.from('data_exports').update({ downloaded_at: null }).eq('id', row.id).eq('status', 'emailed')
    const message = error instanceof Error ? error.message : 'The export file is no longer available.'
    return jsonResponse({ error: message }, 410)
  }
}

async function expireExport(admin: ReturnType<typeof adminClient>, id: string, key: string) {
  await deleteExportObject(key).catch(() => undefined)
  await admin.from('data_exports').update({
    status: 'expired',
    s3_key: null,
    token_hash: null,
  }).eq('id', id)
}

async function writeAudit(
  admin: ReturnType<typeof adminClient>,
  input: {
    ownerId: string
    action: string
    exportId: string
    clientId: string | null
    metadata: Record<string, unknown>
  },
) {
  const { error } = await admin.from('audit_events').insert({
    owner_id: input.ownerId,
    actor_id: input.ownerId,
    action: input.action,
    entity_type: 'data_export',
    entity_id: input.exportId,
    client_id: input.clientId,
    metadata: input.metadata,
  })
  if (error) console.warn('[audit]', error.message)
}

function exportEmail(link: string): string {
  const safe = escapeHtml(link)
  return [
    '<p>Your Process&Note export is ready.</p>',
    `<p><a href="${safe}">Open the download page</a></p>`,
    '<p>The page has a Download button. Opening the page does not use the link up. The button works once, and only within 24 hours.</p>',
    '<p>If you did not ask for this export, contact support@processandnote.app.</p>',
  ].join('')
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function isUuid(value: unknown): boolean {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
