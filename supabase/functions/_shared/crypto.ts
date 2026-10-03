function b64encode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64decode(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(secret: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret)
  const hash = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptJson(secret: string, value: unknown): Promise<Record<string, string>> {
  const key = await importKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return {
    v: '1',
    alg: 'AES-GCM',
    iv: b64encode(iv),
    ciphertext: b64encode(ciphertext),
  }
}

export async function decryptJson<T>(secret: string, payload: Record<string, string>): Promise<T> {
  const key = await importKey(secret)
  const iv = b64decode(payload.iv)
  const ciphertext = b64decode(payload.ciphertext)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
  return b64encode(sig)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
