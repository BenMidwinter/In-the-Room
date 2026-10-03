import { db } from './data/collections'

/** No default letterhead logo — clinicians add their own when ready. */
export const DEFAULT_PRACTICE_LOGO_URL = ''

export interface WorkplaceBranding {
  name: string
  logo_url: string
  address_line1: string
  address_line2: string
  address_line3: string
  postcode: string
  country: string
}

export const DEFAULT_WORKPLACE_BRANDING: Omit<WorkplaceBranding, 'name'> = {
  logo_url: '',
  address_line1: '',
  address_line2: '',
  address_line3: '',
  postcode: '',
  country: 'United Kingdom',
}

export function formatWorkplaceAddress(branding: WorkplaceBranding): string {
  return [
    branding.address_line1,
    branding.address_line2,
    branding.address_line3,
    branding.postcode,
    branding.country,
  ].filter(Boolean).join(', ')
}

export function resolveWorkplaceBranding(workplace: Record<string, unknown> | null | undefined): WorkplaceBranding {
  const name = String(workplace?.name || 'Private practice')
  return {
    name,
    logo_url: String(workplace?.logo_url || DEFAULT_WORKPLACE_BRANDING.logo_url),
    address_line1: String(workplace?.address_line1 || name),
    address_line2: String(workplace?.address_line2 || DEFAULT_WORKPLACE_BRANDING.address_line2),
    address_line3: String(workplace?.address_line3 || DEFAULT_WORKPLACE_BRANDING.address_line3),
    postcode: String(workplace?.postcode || DEFAULT_WORKPLACE_BRANDING.postcode),
    country: String(workplace?.country || DEFAULT_WORKPLACE_BRANDING.country),
  }
}

export function getWorkplaceById(workplaceId: string | null | undefined) {
  if (!workplaceId) return null
  return db.workplaces.find(w => w.id === workplaceId) || null
}

/** Branding applied to letters, progress notes, and other workplace documents. */
export function getWorkplaceBranding(workplaceId: string | null | undefined): WorkplaceBranding {
  return resolveWorkplaceBranding(getWorkplaceById(workplaceId))
}

export function resolvePracticeBranding(profile: Record<string, unknown> | null | undefined): WorkplaceBranding {
  const fullName = String(profile?.full_name || 'Clinician')
  const practiceName = String(profile?.practice_name || '').trim() || fullName
  return {
    name: practiceName,
    logo_url: String(profile?.practice_logo_url || ''),
    address_line1: String(profile?.practice_address_line1 || ''),
    address_line2: String(profile?.practice_address_line2 || ''),
    address_line3: String(profile?.practice_address_line3 || ''),
    postcode: String(profile?.practice_postcode || ''),
    country: String(profile?.practice_country || DEFAULT_WORKPLACE_BRANDING.country),
  }
}

/** Letterhead for exports — workplace branding when linked, otherwise the clinician's private practice. */
export function getClinicalExportBranding(
  workplaceId: string | null | undefined,
  clinicianUserId?: string | null,
): WorkplaceBranding {
  if (workplaceId) return getWorkplaceBranding(workplaceId)
  if (clinicianUserId) {
    const profile = db.profiles.find(p => p.id === clinicianUserId)
    if (profile) return resolvePracticeBranding(profile as Record<string, unknown>)
  }
  return resolveWorkplaceBranding(null)
}

/** Fields applied when creating a workplace without explicit branding. */
export function defaultBrandingFieldsForWorkplace(name: string) {
  return {
    logo_url: DEFAULT_WORKPLACE_BRANDING.logo_url,
    address_line1: name,
    address_line2: DEFAULT_WORKPLACE_BRANDING.address_line2,
    address_line3: DEFAULT_WORKPLACE_BRANDING.address_line3,
    postcode: DEFAULT_WORKPLACE_BRANDING.postcode,
    country: DEFAULT_WORKPLACE_BRANDING.country,
  }
}
