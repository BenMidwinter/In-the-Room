import { getSupabase } from './client'
import { PRIVATE_PRACTICE_LOCATION_ID, normalizeWeeklyHours } from '../clinicianAvailability'
import type { WorkplaceClinicianSetting } from '../clinicianAvailability'
import type { Json } from './database.types'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function listAvailabilitySettings(): Promise<WorkplaceClinicianSetting[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('availability_rules')
    .select('location_key, organization_id, weekly_hours, service_ids')
    .order('location_key', { ascending: true })

  if (error) throw error

  return (data || []).map((row) => {
    const locationKey = row.location_key || (row.organization_id ? String(row.organization_id) : PRIVATE_PRACTICE_LOCATION_ID)
    return {
      workplace_id: locationKey,
      weekly_hours: normalizeWeeklyHours(row.weekly_hours as Record<string, unknown>),
      service_ids: Array.isArray(row.service_ids) ? row.service_ids.map(String) : [],
    }
  })
}

export async function saveAvailabilitySettings(
  settings: WorkplaceClinicianSetting[],
): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  for (const setting of settings) {
    const locationKey = setting.workplace_id || PRIVATE_PRACTICE_LOCATION_ID
    const organizationId = locationKey !== PRIVATE_PRACTICE_LOCATION_ID && isUuid(locationKey)
      ? locationKey
      : null

    const { error } = await supabase
      .from('availability_rules')
      .upsert(
        {
          owner_id: user.id,
          location_key: locationKey,
          organization_id: organizationId,
          weekly_hours: setting.weekly_hours as unknown as Json,
          service_ids: setting.service_ids.filter(isUuid),
        },
        { onConflict: 'owner_id,location_key' },
      )

    if (error) throw error
  }
}
