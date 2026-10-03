import { getSupabase } from './client'
import type { Json } from './database.types'

type AuditInput = {
  action: string
  entityType: string
  entityId?: string | null
  clientId?: string | null
  requestId?: string | null
  metadata?: Record<string, Json | undefined>
}

/** Append-only audit event for the signed-in clinician. No-ops if offline/unconfigured. */
export async function writeAuditEvent(input: AuditInput): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('audit_events').insert({
    owner_id: user.id,
    actor_id: user.id,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    client_id: input.clientId ?? null,
    request_id: input.requestId ?? null,
    metadata: (input.metadata ?? {}) as Json,
  })

  if (error) {
    console.warn('[audit]', error.message)
  }
}
