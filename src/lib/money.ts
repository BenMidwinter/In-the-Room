/** Pounds typed by a clinician, stored as whole pence. */

export function parseFeePounds(value: string): { pence: number | null; error: string | null } {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return { pence: null, error: null }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { pence: null, error: 'Enter a price in pounds, such as 80 or 80.00.' }
  }
  const [whole, frac = ''] = trimmed.split('.')
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return { pence, error: null }
}

export function feePenceToInput(pence: number | null | undefined): string {
  if (pence == null || Number.isNaN(Number(pence))) return ''
  const whole = Math.floor(Number(pence) / 100)
  const frac = String(Math.abs(Number(pence)) % 100).padStart(2, '0')
  return `${whole}.${frac}`
}

export function formatGbpFromPence(pence: number): string {
  const negative = pence < 0
  const abs = Math.abs(Math.trunc(pence))
  const pounds = Math.floor(abs / 100).toLocaleString('en-GB')
  const frac = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}£${pounds}.${frac}`
}

export function formatServiceFee(pence: number | null | undefined, includesVat = false): string {
  if (pence == null) return ''
  const amount = formatGbpFromPence(pence)
  return includesVat ? `${amount} incl. VAT` : amount
}
