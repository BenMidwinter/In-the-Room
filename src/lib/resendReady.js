/** True when both Resend Edge Function secrets are present. */
export function resendReady(key, from) {
  return Boolean(String(key || '').trim() && String(from || '').trim())
}
