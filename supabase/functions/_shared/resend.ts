import { resendReady } from '../../../src/lib/resendReady.js'
import { secret } from './secrets.ts'

export function resendSettings() {
  const key = secret('RESEND_API_KEY')
  const from = secret('RESEND_FROM_EMAIL')
  return { key, from, ready: resendReady(key, from) }
}

export async function sendResendEmail(message: {
  to: string
  subject: string
  html: string
  idempotencyKey: string
}): Promise<void> {
  const { key, from, ready } = resendSettings()
  if (!ready) throw new Error('Email is not connected yet.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const reason = String(payload?.message || payload?.error || 'Email provider rejected this message.')
    throw new Error(reason)
  }
}

export async function sendResendBatch(
  messages: Array<{ from: string; to: string[]; reply_to?: string; subject: string; html: string }>,
  idempotencyKey: string,
): Promise<{ id: string }> {
  const { key, ready } = resendSettings()
  if (!ready) throw new Error('Email is not connected yet.')
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(messages),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(payload?.message || payload?.error || 'Email provider rejected this batch.'))
  }
  return { id: String(payload?.id || idempotencyKey) }
}
