import { b64decode } from './envelope.ts'
import { secret } from './secrets.ts'

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
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
  const kService = await hmac(kRegion, 'kms')
  return hmac(kService, 'aws4_request')
}

function amzDate(now = new Date()): { amz: string; stamp: string } {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amz, stamp: amz.slice(0, 8) }
}

async function kms(target: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const accessKey = secret('AWS_ACCESS_KEY_ID')
  const secretKey = secret('AWS_SECRET_ACCESS_KEY')
  const region = secret('AWS_REGION') || 'eu-west-2'
  if (!accessKey || !secretKey) throw new Error('The practice key is not configured.')

  const body = JSON.stringify(payload)
  const host = `kms.${region}.amazonaws.com`
  const { amz, stamp } = amzDate()
  const payloadHash = await sha256Hex(body)
  const canonicalHeaders = [
    'content-type:application/x-amz-json-1.1',
    `host:${host}`,
    `x-amz-date:${amz}`,
    `x-amz-target:TrentService.${target}`,
  ].join('\n')
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target'
  const canonical = ['POST', '/', '', `${canonicalHeaders}\n`, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${stamp}/${region}/kms/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amz, credentialScope, await sha256Hex(canonical)].join('\n')
  const signature = hex(new Uint8Array(await hmac(await signingKey(secretKey, stamp, region), stringToSign)))
  const response = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      host,
      'x-amz-date': amz,
      'x-amz-target': `TrentService.${target}`,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  })
  const text = await response.text()
  const parsed = text ? JSON.parse(text) as Record<string, unknown> : {}
  if (!response.ok) {
    console.error('KMS request failed', target, parsed.__type || response.status)
    throw new Error('The practice key could not be opened.')
  }
  return parsed
}

export function kmsKeyId(): string {
  const keyId = secret('AWS_KMS_KEY_ID')
  if (!keyId) throw new Error('The practice key is not configured.')
  return keyId
}

export async function generateDataKey(): Promise<{ wrapped: string; raw: Uint8Array }> {
  const result = await kms('GenerateDataKey', { KeyId: kmsKeyId(), KeySpec: 'AES_256' })
  const wrapped = String(result.CiphertextBlob || '')
  const raw = b64decode(String(result.Plaintext || ''))
  if (!wrapped || raw.byteLength !== 32) throw new Error('The practice key could not be opened.')
  return { wrapped, raw }
}

export async function decryptDataKey(wrapped: string): Promise<Uint8Array> {
  const result = await kms('Decrypt', { CiphertextBlob: wrapped, KeyId: kmsKeyId() })
  const raw = b64decode(String(result.Plaintext || ''))
  if (raw.byteLength !== 32) throw new Error('The practice key could not be opened.')
  return raw
}
