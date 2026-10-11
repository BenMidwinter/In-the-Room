export function b64encode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function b64decode(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<Record<string, string | number>> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return {
    v: 1,
    alg: 'AES-256-GCM',
    iv: b64encode(iv),
    ciphertext: b64encode(ciphertext),
  }
}

export async function openJson(key: CryptoKey, payload: Record<string, unknown>): Promise<unknown> {
  const iv = b64decode(String(payload.iv || ''))
  const ciphertext = b64decode(String(payload.ciphertext || ''))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext))
}

export function isEnvelopePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.alg === 'AES-256-GCM' && typeof row.iv === 'string' && typeof row.ciphertext === 'string'
}
