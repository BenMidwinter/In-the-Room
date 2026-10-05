import { formatGbpFromPence } from './money'

export type ConcessionKind = 'none' | 'percent' | 'amount'

export type ClientConcession = {
  kind: ConcessionKind
  percent: number | null
  amountPence: number | null
  label: string
}

export const NO_CONCESSION: ClientConcession = {
  kind: 'none',
  percent: null,
  amountPence: null,
  label: '',
}

export function concessionFromClient(client?: {
  concession_kind?: string | null
  concession_percent?: number | null
  concession_pence?: number | null
  concession_label?: string | null
} | null): ClientConcession {
  const kind = client?.concession_kind
  if (kind === 'percent' && client?.concession_percent) {
    return {
      kind: 'percent',
      percent: Math.min(100, Math.max(1, Math.trunc(Number(client.concession_percent)))),
      amountPence: null,
      label: String(client.concession_label || '').trim(),
    }
  }
  if (kind === 'amount' && client?.concession_pence) {
    return {
      kind: 'amount',
      percent: null,
      amountPence: Math.max(1, Math.trunc(Number(client.concession_pence))),
      label: String(client.concession_label || '').trim(),
    }
  }
  return { ...NO_CONCESSION }
}

export function concessionPhrase(concession: ClientConcession): string {
  const name = concession.label.trim()
  if (concession.kind === 'percent' && concession.percent) {
    return name ? `${name} ${concession.percent}%` : `${concession.percent}% concession`
  }
  if (concession.kind === 'amount' && concession.amountPence) {
    const money = formatGbpFromPence(concession.amountPence)
    return name ? `${name} ${money} off` : `${money} off`
  }
  return ''
}

export function applyConcession(
  feePence: number | null | undefined,
  concession: ClientConcession = NO_CONCESSION,
): number | null {
  if (feePence == null || !Number.isFinite(Number(feePence))) return null
  const fee = Math.max(0, Math.trunc(Number(feePence)))
  if (concession.kind === 'percent' && concession.percent) {
    const kept = 100 - Math.min(100, Math.max(0, concession.percent))
    return Math.max(0, Math.round((fee * kept) / 100))
  }
  if (concession.kind === 'amount' && concession.amountPence) {
    return Math.max(0, fee - concession.amountPence)
  }
  return fee
}

/** The price for this session. A custom amount replaces the service price and any concession. */
export function sessionBasePence({
  feePence,
  overridePence,
  concession = NO_CONCESSION,
}: {
  feePence: number | null | undefined
  overridePence?: number | null
  concession?: ClientConcession
}): { pence: number | null; phrase: string } {
  if (overridePence != null && Number.isFinite(Number(overridePence))) {
    return { pence: Math.max(0, Math.trunc(Number(overridePence))), phrase: 'this session' }
  }
  return {
    pence: applyConcession(feePence, concession),
    phrase: concessionPhrase(concession),
  }
}
