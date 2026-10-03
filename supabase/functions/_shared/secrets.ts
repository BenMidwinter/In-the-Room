/** Trimmed Edge Function secret, or empty string when unset. */
export function secret(name: string): string {
  return String(Deno.env.get(name) || '').trim()
}

/**
 * Key used for OAuth state HMAC and credential encryption.
 * Prefer CREDENTIALS_ENCRYPTION_KEY; fall back to the injected service role key
 * so local/dev projects still work before the dedicated secret is set.
 */
export function credentialsKey(): string {
  return secret('CREDENTIALS_ENCRYPTION_KEY') || secret('SUPABASE_SERVICE_ROLE_KEY')
}
