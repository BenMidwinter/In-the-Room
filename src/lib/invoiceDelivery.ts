import type { InvoiceRecord } from './invoices'
import { invokeFunction } from './supabase/invokeFunction'
import { setInvoiceStatus, stampInvoiceDelivery } from './supabase/invoicesRepo'

export type SendBatchPayload = {
  invoiceIds: string[]
  deliveryMethod: 'email' | 'manual_mark_sent'
  customNote?: string
}

export type BatchDeliveryResult = {
  successfulIds: string[]
  failed: Array<{ id: string; clientName: string; reason: string }>
}

const CHUNK = 100

type SendResponse = {
  email?: boolean
  batchId?: string
  sent?: Array<{ id: string }>
  failed?: Array<{ id: string; reason?: string }>
  error?: string
}

/** True only when the send function can see a Resend key. A missing function counts as not connected. */
export async function emailDeliveryAvailable(): Promise<boolean> {
  try {
    const data = await invokeFunction<{ email?: boolean }>('send-invoice-batch', {
      body: { action: 'probe' },
    })
    return Boolean(data?.email)
  } catch {
    return false
  }
}

export async function sendInvoiceBatch(
  payload: SendBatchPayload,
  options: {
    invoices?: InvoiceRecord[]
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<BatchDeliveryResult> {
  const byId = new Map((options.invoices || []).map((invoice) => [invoice.id, invoice]))
  const ids = [...new Set(payload.invoiceIds)]
  const successfulIds: string[] = []
  const failed: BatchDeliveryResult['failed'] = []
  const total = ids.length
  let done = 0
  const nameOf = (id: string) => byId.get(id)?.billToName || 'Invoice'
  const tick = () => {
    done += 1
    options.onProgress?.(done, total)
  }

  if (payload.deliveryMethod === 'email') {
    const available = await emailDeliveryAvailable()
    if (!available) {
      for (const id of ids) {
        failed.push({ id, clientName: nameOf(id), reason: 'Email is not connected yet.' })
        tick()
      }
      return { successfulIds, failed }
    }
    for (let index = 0; index < ids.length; index += CHUNK) {
      const chunk = ids.slice(index, index + CHUNK)
      let response: SendResponse
      try {
        response = await invokeFunction<SendResponse>('send-invoice-batch', {
          body: {
            action: 'send',
            invoiceIds: chunk,
            customNote: payload.customNote || '',
          },
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Could not send this invoice.'
        for (const id of chunk) {
          failed.push({ id, clientName: nameOf(id), reason })
          await rememberError(id, reason)
          tick()
        }
        continue
      }
      if (response.email === false) {
        for (const id of chunk) {
          failed.push({ id, clientName: nameOf(id), reason: 'Email is not connected yet.' })
          tick()
        }
        continue
      }
      const sentIds = new Set((response.sent || []).map((item) => item.id))
      const rejected = new Map((response.failed || []).map((item) => [item.id, item.reason || 'Could not send this invoice.']))
      for (const id of chunk) {
        if (!sentIds.has(id)) {
          const reason = rejected.get(id) || response.error || 'Could not send this invoice.'
          failed.push({ id, clientName: nameOf(id), reason })
          await rememberError(id, reason)
          tick()
          continue
        }
        try {
          await setInvoiceStatus(id, 'issued')
          await stampInvoiceDelivery(id, {
            deliveryMethod: 'resend',
            resendBatchId: response.batchId || null,
            lastDeliveryError: null,
            recipientEmail: byId.get(id)?.billToEmail || '',
          })
          successfulIds.push(id)
        } catch (err) {
          failed.push({
            id,
            clientName: nameOf(id),
            reason: err instanceof Error ? err.message : 'The email went out, but the invoice could not be marked as sent.',
          })
        }
        tick()
      }
    }
    return { successfulIds, failed }
  }

  for (const id of ids) {
    const invoice = byId.get(id)
    if (invoice && invoice.status !== 'draft') {
      failed.push({ id, clientName: nameOf(id), reason: 'This invoice is not a draft.' })
      tick()
      continue
    }
    try {
      await setInvoiceStatus(id, 'issued')
      successfulIds.push(id)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Could not mark this invoice as sent.'
      failed.push({ id, clientName: nameOf(id), reason })
      await rememberError(id, reason)
    }
    tick()
  }
  return { successfulIds, failed }
}

async function rememberError(id: string, reason: string) {
  try {
    await stampInvoiceDelivery(id, { lastDeliveryError: reason })
  } catch {
    /* The visible failure list is the record that matters if the stamp cannot be saved. */
  }
}
