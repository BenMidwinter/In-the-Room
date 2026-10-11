import { decryptDataKey } from './awsKms.ts'
import { importDek, openJson } from './envelope.ts'
import { adminClient } from './supabaseAdmin.ts'

const dekCache = new Map<string, { key: CryptoKey; exp: number }>()

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function dekFor(admin: ReturnType<typeof adminClient>, organizationId: string): Promise<CryptoKey> {
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

export async function organizationIdFor(admin: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.organization_id) throw new Error('The practice key could not be opened.')
  return String(data.organization_id)
}

export async function readEnvelope(
  admin: ReturnType<typeof adminClient>,
  organizationId: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  return asObject(await openJson(await dekFor(admin, organizationId), asObject(payload)))
}
