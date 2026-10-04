import { getProfile } from './store'
import { getSupabase } from './supabase/client'
import type { LetterheadRow } from './supabase/letterheadsRepo'

export type ClinicianPrintIdentity = {
  clinicianName: string
  professionalTitle: string
}

export type PrintLetterhead = ClinicianPrintIdentity & {
  practiceName: string
  logoUrl: string
  addressLines: string[]
}

export function addressLinesFromLetterhead(row: Partial<LetterheadRow> | null | undefined): string[] {
  if (!row) return []
  return [
    row.address_line1,
    row.address_line2,
    row.address_line3,
    row.postcode,
    row.country,
  ].map((line) => String(line || '').trim()).filter(Boolean)
}

export function preferredLetterhead<T extends { is_default?: boolean }>(rows: T[]): T | null {
  if (!rows?.length) return null
  return rows.find((row) => row.is_default) || rows[0]
}

export function printLetterheadFromRow(
  row: Partial<LetterheadRow> | null | undefined,
  identity: ClinicianPrintIdentity,
): PrintLetterhead {
  return {
    practiceName: String(row?.practice_name || row?.name || '').trim(),
    logoUrl: String(row?.logo_url || '').trim(),
    addressLines: addressLinesFromLetterhead(row),
    clinicianName: identity.clinicianName.trim(),
    professionalTitle: identity.professionalTitle.trim(),
  }
}

export async function loadClinicianPrintIdentity(userId?: string | null): Promise<ClinicianPrintIdentity> {
  const local = userId ? getProfile(userId) : null
  let clinicianName = String(local?.display_name || local?.full_name || '').trim()
  let professionalTitle = String(local?.professional_title || '').trim()

  const supabase = getSupabase()
  if (supabase && userId) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, professional_title')
      .eq('id', userId)
      .maybeSingle()
    const remoteName = String(data?.display_name || '').trim()
    const remoteTitle = String(data?.professional_title || '').trim()
    if (remoteName) clinicianName = remoteName
    if (remoteTitle) professionalTitle = remoteTitle
  }

  return { clinicianName, professionalTitle }
}

type ChooseLetterhead = (options: {
  title: string
  message: string
  options: Array<{ value: string; label: string }>
  defaultValue: string
  confirmLabel: string
}) => Promise<string | null>

/** Use the only letterhead, or ask when there are several. Cancel returns null. */
export async function resolveDownloadLetterhead(
  rows: LetterheadRow[],
  choose: ChooseLetterhead,
  identity: ClinicianPrintIdentity,
): Promise<PrintLetterhead | null> {
  if (rows.length === 0) return printLetterheadFromRow(null, identity)
  if (rows.length === 1) return printLetterheadFromRow(rows[0], identity)

  const fallback = rows.find((row) => row.is_default) || rows[0]
  const selectedId = await choose({
    title: 'Which letterhead?',
    message: 'Choose the letterhead for this download.',
    options: rows.map((row) => ({
      value: row.id,
      label: row.practice_name || row.name || 'Letterhead',
    })),
    defaultValue: fallback.id,
    confirmLabel: 'Download',
  })
  if (!selectedId) return null
  const selected = rows.find((row) => row.id === selectedId) || fallback
  return printLetterheadFromRow(selected, identity)
}
