import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { deleteStoredObject, presignObject } from '../_shared/s3.ts'
import { userClient } from '../_shared/supabaseAdmin.ts'

const MAX_BYTES = 20 * 1024 * 1024
const PUT_SECONDS = 300
const GET_SECONDS = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/rtf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/heic',
  'image/heif',
])

const EXT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization' }, 401)
    const supabase = userClient(authHeader)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
    const body = await req.json().catch(() => ({}))
    if (body.action === 'upload') return await uploadUrl(supabase, user.id, body)
    if (body.action === 'download') return await downloadUrl(supabase, user.id, body)
    if (body.action === 'delete') return await deleteFile(supabase, user.id, body)
    return jsonResponse({ error: 'That file action is not available.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be stored.'
    return jsonResponse({ error: message }, 500)
  }
})

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
  return cleaned || 'file'
}

function contentTypeFor(fileName: string, fileType: unknown): string {
  const given = typeof fileType === 'string' ? fileType.trim().toLowerCase() : ''
  if (given.startsWith('image/') || ALLOWED_TYPES.has(given)) return given
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return EXT_TYPES[ext] || ''
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '').slice(0, 180) || 'file'
  return `attachment; filename="${ascii}"`
}

async function uploadUrl(
  supabase: ReturnType<typeof userClient>,
  userId: string,
  body: Record<string, unknown>,
) {
  if (!isUuid(body.clientId)) return jsonResponse({ error: 'Choose a client first.' }, 400)
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
  if (!fileName || fileName.length > 200) return jsonResponse({ error: 'Enter a file name.' }, 400)
  const fileSize = Number(body.fileSize)
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
    return jsonResponse({ error: 'Choose a file up to 20 MB.' }, 400)
  }
  const fileType = contentTypeFor(fileName, body.fileType)
  if (!fileType) return jsonResponse({ error: 'That file type is not allowed.' }, 400)

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, organization_id, owner_id')
    .eq('id', body.clientId)
    .maybeSingle()
  if (error) return jsonResponse({ error: 'That client could not be opened.' }, 400)
  if (!client || client.owner_id !== userId) return jsonResponse({ error: 'That client is not on your caseload.' }, 403)

  const fileId = crypto.randomUUID()
  const s3Key = `clients/${userId}/${body.clientId}/${fileId}/${safeFileName(fileName)}`
  const signed = await presignObject({
    method: 'PUT',
    key: s3Key,
    expiresSeconds: PUT_SECONDS,
    contentType: fileType,
  })
  return jsonResponse({
    fileId,
    s3Key,
    fileType,
    organizationId: client.organization_id,
    uploadUrl: signed.url,
    headers: signed.headers,
    expiresIn: PUT_SECONDS,
  })
}

async function ownedFile(
  supabase: ReturnType<typeof userClient>,
  userId: string,
  fileId: unknown,
) {
  if (!isUuid(fileId)) return { error: jsonResponse({ error: 'Choose a file first.' }, 400) }
  const { data: file, error } = await supabase
    .from('client_files')
    .select('id, file_name, s3_key, owner_id')
    .eq('id', fileId)
    .maybeSingle()
  if (error) return { error: jsonResponse({ error: 'That file could not be opened.' }, 400) }
  if (!file || file.owner_id !== userId || !String(file.s3_key).startsWith(`clients/${userId}/`)) {
    return { error: jsonResponse({ error: 'That file is not on your caseload.' }, 403) }
  }
  return { file }
}

async function downloadUrl(
  supabase: ReturnType<typeof userClient>,
  userId: string,
  body: Record<string, unknown>,
) {
  const found = await ownedFile(supabase, userId, body.fileId)
  if (found.error) return found.error
  const signed = await presignObject({
    method: 'GET',
    key: found.file.s3_key,
    expiresSeconds: GET_SECONDS,
    responseContentDisposition: contentDisposition(found.file.file_name),
  })
  return jsonResponse({
    downloadUrl: signed.url,
    fileName: found.file.file_name,
    expiresIn: GET_SECONDS,
  })
}

async function deleteFile(
  supabase: ReturnType<typeof userClient>,
  userId: string,
  body: Record<string, unknown>,
) {
  const found = await ownedFile(supabase, userId, body.fileId)
  if (found.error) return found.error
  await deleteStoredObject(found.file.s3_key)
  const { error } = await supabase.from('client_files').delete().eq('id', found.file.id)
  if (error) return jsonResponse({ error: 'The file record could not be removed.' }, 400)
  return jsonResponse({ ok: true })
}
