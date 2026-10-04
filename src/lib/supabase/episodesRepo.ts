import { getSupabase, isSupabaseConfigured } from './client'
import type { Json } from './database.types'
import {
  activeLocalEpisode,
  dischargeLocalEpisode,
  listLocalEpisodes,
  openLocalEpisode,
  rememberLocalEpisode,
  reopenLocalEpisode,
  type AppEpisode,
  type EpisodeStatus,
} from '../store/episodes'

const EPISODE_COLUMNS = 'id, owner_id, organization_id, client_id, episode_number, status, referral_date, start_date, end_date, created_at, updated_at'

type EpisodeRow = {
  id: string
  owner_id: string
  organization_id: string | null
  client_id: string
  episode_number: number
  status: string
  referral_date: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

function toAppEpisode(row: EpisodeRow): AppEpisode {
  const status = (row.status === 'paused' || row.status === 'discharged' || row.status === 'active')
    ? row.status
    : 'active'
  return {
    id: row.id,
    client_id: row.client_id,
    owner_id: row.owner_id,
    organization_id: row.organization_id,
    episode_number: row.episode_number,
    status: status as EpisodeStatus,
    referral_date: row.referral_date,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function hydrate(episodes: AppEpisode[]) {
  for (const episode of episodes) rememberLocalEpisode(episode)
}

export async function listEpisodesForClient(clientId: string): Promise<AppEpisode[]> {
  if (!clientId) return []
  if (!isSupabaseConfigured()) return listLocalEpisodes(clientId)
  const supabase = getSupabase()
  if (!supabase) return listLocalEpisodes(clientId)

  const { data, error } = await supabase
    .from('episodes')
    .select(EPISODE_COLUMNS)
    .eq('client_id', clientId)
    .order('episode_number', { ascending: false })
  if (error) throw error
  const mapped = (data || []).map((row) => toAppEpisode(row as EpisodeRow))
  hydrate(mapped)
  return listLocalEpisodes(clientId)
}

export async function findActiveEpisode(clientId: string): Promise<AppEpisode | null> {
  if (!clientId) return null
  if (!isSupabaseConfigured()) return activeLocalEpisode(clientId)
  const supabase = getSupabase()
  if (!supabase) return activeLocalEpisode(clientId)

  const { data, error } = await supabase
    .from('episodes')
    .select(EPISODE_COLUMNS)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const mapped = toAppEpisode(data as EpisodeRow)
  rememberLocalEpisode(mapped)
  return mapped
}

export async function openEpisode(input: {
  clientId: string
  ownerId: string
  organizationId?: string | null
  startDate?: string | null
}): Promise<AppEpisode> {
  if (!isSupabaseConfigured()) return openLocalEpisode(input)
  const supabase = getSupabase()
  if (!supabase) return openLocalEpisode(input)

  const active = await findActiveEpisode(input.clientId)
  if (active) return active

  const { data: existingRows, error: listError } = await supabase
    .from('episodes')
    .select('episode_number')
    .eq('client_id', input.clientId)
  if (listError) throw listError
  const episodeNumber = (existingRows || []).reduce(
    (max, row) => Math.max(max, Number(row.episode_number) || 0),
    0,
  ) + 1
  const startDate = input.startDate || new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('episodes')
    .insert({
      owner_id: input.ownerId,
      organization_id: input.organizationId || null,
      client_id: input.clientId,
      episode_number: episodeNumber,
      status: 'active',
      referral_date: startDate,
      start_date: startDate,
      end_date: null,
      encrypted_payload: { v: 0 } as Json,
    })
    .select(EPISODE_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      const raced = await findActiveEpisode(input.clientId)
      if (raced) return raced
    }
    throw error
  }

  const mapped = toAppEpisode(data as EpisodeRow)
  rememberLocalEpisode(mapped)
  return mapped
}

/** Make a discharged course the open one again. */
export async function reopenEpisode(episodeId: string): Promise<AppEpisode> {
  if (!isSupabaseConfigured()) return reopenLocalEpisode(episodeId)
  const supabase = getSupabase()
  if (!supabase) return reopenLocalEpisode(episodeId)

  const { data: current, error: readError } = await supabase
    .from('episodes')
    .select(EPISODE_COLUMNS)
    .eq('id', episodeId)
    .maybeSingle()
  if (readError) throw readError
  if (!current) throw new Error('Episode not found')
  if (current.status === 'active') {
    const mapped = toAppEpisode(current as EpisodeRow)
    rememberLocalEpisode(mapped)
    return mapped
  }

  const { data, error } = await supabase
    .from('episodes')
    .update({ status: 'active', end_date: null })
    .eq('id', episodeId)
    .select(EPISODE_COLUMNS)
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('Another course is still open. Discharge it before reopening this one.')
    }
    throw error
  }
  const mapped = toAppEpisode(data as EpisodeRow)
  rememberLocalEpisode(mapped)
  return mapped
}

/** Discharge closes the course. Documents already on it stay writable. */
export async function dischargeEpisode(episodeId: string, endDate?: string | null): Promise<AppEpisode> {
  if (!isSupabaseConfigured()) return dischargeLocalEpisode(episodeId, endDate)
  const supabase = getSupabase()
  if (!supabase) return dischargeLocalEpisode(episodeId, endDate)

  const end = endDate || new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('episodes')
    .update({
      status: 'discharged',
      end_date: end,
    })
    .eq('id', episodeId)
    .eq('status', 'active')
    .select(EPISODE_COLUMNS)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const { data: current, error: readError } = await supabase
      .from('episodes')
      .select(EPISODE_COLUMNS)
      .eq('id', episodeId)
      .maybeSingle()
    if (readError) throw readError
    if (current && current.status === 'discharged') {
      const mapped = toAppEpisode(current as EpisodeRow)
      rememberLocalEpisode(mapped)
      return mapped
    }
    throw new Error('No open episode to discharge')
  }
  const mapped = toAppEpisode(data as EpisodeRow)
  rememberLocalEpisode(mapped)
  return mapped
}
