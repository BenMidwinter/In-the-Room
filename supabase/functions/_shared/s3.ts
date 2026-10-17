import { secret } from './secrets.ts'

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return hex(new Uint8Array(digest))
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function signingKey(secretAccessKey: string, dateStamp: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

function amzDate(now = new Date()): { amz: string; stamp: string } {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amz, stamp: amz.slice(0, 8) }
}

export function exportBucket(): { bucket: string; region: string } {
  const bucket = secret('EXPORT_S3_BUCKET') || secret('AWS_S3_BUCKET')
  const region = secret('EXPORT_S3_REGION') || secret('AWS_REGION') || 'eu-west-2'
  if (!bucket) throw new Error('Export storage is not configured.')
  return { bucket, region }
}

async function signedS3(
  method: string,
  key: string,
  body?: Uint8Array,
  contentType?: string,
): Promise<Response> {
  const accessKey = secret('AWS_ACCESS_KEY_ID')
  const secretKey = secret('AWS_SECRET_ACCESS_KEY')
  if (!accessKey || !secretKey) throw new Error('Export storage is not configured.')
  const { bucket, region } = exportBucket()
  const host = `${bucket}.s3.${region}.amazonaws.com`
  const path = `/${key.split('/').map(encodeURIComponent).join('/')}`
  const payload = body || new Uint8Array()
  const { amz, stamp } = amzDate()
  const payloadHash = await sha256Hex(payload)
  const headerLines = [
    contentType ? `content-type:${contentType}` : '',
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amz}`,
  ].filter(Boolean)
  const signedHeaders = [
    contentType ? 'content-type' : '',
    'host',
    'x-amz-content-sha256',
    'x-amz-date',
  ].filter(Boolean).join(';')
  const canonical = [method, path, '', `${headerLines.join('\n')}\n`, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${stamp}/${region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amz, credentialScope, await sha256Hex(new TextEncoder().encode(canonical))].join('\n')
  const signature = hex(new Uint8Array(await hmac(await signingKey(secretKey, stamp, region), stringToSign)))
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
  if (contentType) headers['content-type'] = contentType
  return fetch(`https://${host}${path}`, { method, headers, body: body ? body : undefined })
}

export async function putExportObject(key: string, body: Uint8Array): Promise<void> {
  const response = await signedS3('PUT', key, body, 'application/zip')
  if (!response.ok) {
    console.error('S3 put failed', response.status)
    throw new Error('The export could not be stored.')
  }
}

export async function getExportObject(key: string): Promise<Uint8Array> {
  const response = await signedS3('GET', key)
  if (!response.ok) {
    console.error('S3 get failed', response.status)
    throw new Error('The export file is no longer available.')
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function deleteExportObject(key: string): Promise<void> {
  const response = await signedS3('DELETE', key)
  if (!response.ok && response.status !== 404) {
    console.error('S3 delete failed', response.status)
    throw new Error('The export file could not be removed.')
  }
}
