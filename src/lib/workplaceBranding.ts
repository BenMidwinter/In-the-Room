import { db } from './data/collections'

/** Default practice mark for letterhead when no logo is set. */
const DEFAULT_PRACTICE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="In the Room">
  <defs>
    <linearGradient id="ck" x1="8%" y1="12%" x2="92%" y2="88%">
      <stop offset="0%" stop-color="#ee4e14"/>
      <stop offset="38%" stop-color="#e22a85"/>
      <stop offset="72%" stop-color="#58c2d5"/>
      <stop offset="100%" stop-color="#a9dde7"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#ck)"/>
  <path fill="#fff" fill-opacity="0.95" d="M22 34c0-6.6 5-11 11.5-11 4.2 0 7.4 1.6 9.5 4.2l-4.8 3.8c-1.3-1.6-3.1-2.5-5.2-2.5-3.4 0-5.8 2.4-5.8 5.8s2.4 5.8 5.8 5.8c2.2 0 4-1 5.3-2.7l4.7 3.7c-2.2 2.8-5.6 4.4-10 4.4C27 45.5 22 41 22 34z"/>
</svg>`

export const DEFAULT_PRACTICE_LOGO_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_PRACTICE_LOGO_SVG)}`

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
  logo_url: DEFAULT_PRACTICE_LOGO_URL,
  address_line1: 'Private practice',
  address_line2: '42 Creative Quarter',
  address_line3: 'London',
  postcode: 'SE1 4AA',
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
    logo_url: String(profile?.practice_logo_url || DEFAULT_WORKPLACE_BRANDING.logo_url),
    address_line1: String(profile?.practice_address_line1 || practiceName),
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
