import { db } from '../data/collections'
import type { StoreRecord } from '../types/collections'
import { todayYmd } from '../dateArchitecture'
import { nextEpisodeNumber } from '../scheduling/episodes'

export type EpisodeStatus = 'active' | 'paused' | 'discharged'

export type AppEpisode = {
  id: string
  client_id: string
  owner_id: string
  organization_id: string | null
  episode_number: number
  status: EpisodeStatus
  referral_date: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

function asEpisode(row: StoreRecord): AppEpisode {
  return row as unknown as AppEpisode
}

export function listLocalEpisodes(clientId: string): AppEpisode[] {
  return db.episodes
    .filter((row) => row.client_id === clientId)
    .map(asEpisode)
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (b.status === 'active' && a.status !== 'active') return 1
      return (b.episode_number || 0) - (a.episode_number || 0)
    })
}

export function getLocalEpisode(episodeId: string): AppEpisode | null {
  const row = db.episodes.find((item) => item.id === episodeId)
  return row ? asEpisode(row) : null
}

export function activeLocalEpisode(clientId: string): AppEpisode | null {
  const row = db.episodes.find((item) => item.client_id === clientId && item.status === 'active')
  return row ? asEpisode(row) : null
}

export function rememberLocalEpisode(episode: AppEpisode): AppEpisode {
  const idx = db.episodes.findIndex((row) => row.id === episode.id)
  if (idx === -1) db.episodes.push(episode as unknown as StoreRecord)
  else db.episodes[idx] = { ...db.episodes[idx], ...episode } as StoreRecord
  return episode
}

export function openLocalEpisode(input: {
  clientId: string
  ownerId: string
  organizationId?: string | null
  startDate?: string | null
}): AppEpisode {
  const existing = activeLocalEpisode(input.clientId)
  if (existing) return existing

  const numbers = db.episodes
    .filter((row) => row.client_id === input.clientId)
    .map((row) => Number(row.episode_number) || 0)
  const now = new Date().toISOString()
  const startDate = input.startDate || todayYmd()
  const created: AppEpisode = {
    id: crypto.randomUUID(),
    client_id: input.clientId,
    owner_id: input.ownerId,
    organization_id: input.organizationId || null,
    episode_number: nextEpisodeNumber(numbers),
    status: 'active',
    referral_date: startDate,
    start_date: startDate,
    end_date: null,
    created_at: now,
    updated_at: now,
  }
  rememberLocalEpisode(created)
  return created
}

/** Open a discharged course again. Another open course has to be discharged first. */
export function reopenLocalEpisode(episodeId: string): AppEpisode {
  const idx = db.episodes.findIndex((row) => row.id === episodeId)
  if (idx === -1) throw new Error('Episode not found')
  const prev = asEpisode(db.episodes[idx])
  if (prev.status === 'active') return prev
  const other = db.episodes.find((row) => (
    row.client_id === prev.client_id && row.status === 'active' && row.id !== episodeId
  ))
  if (other) {
    throw new Error(`Episode ${other.episode_number} is still open. Discharge it before reopening this course.`)
  }
  const next: AppEpisode = {
    ...prev,
    status: 'active',
    end_date: null,
    updated_at: new Date().toISOString(),
  }
  db.episodes[idx] = next as unknown as StoreRecord
  return next
}

/**
 * Remove a course that was opened by mistake.
 * Appointments stay on the client and come off the course.
 * Process Notes and reports that belonged to the course are removed with it.
 */
export function deleteLocalEpisode(episodeId: string): AppEpisode {
  const episode = getLocalEpisode(episodeId)
  if (!episode) throw new Error('Episode not found')
  for (const row of db.appointments) {
    if (row.episode_id === episodeId) row.episode_id = null
  }
  for (let i = db.progressNotes.length - 1; i >= 0; i -= 1) {
    if (db.progressNotes[i].episode_id === episodeId) db.progressNotes.splice(i, 1)
  }
  for (let i = db.reports.length - 1; i >= 0; i -= 1) {
    if (db.reports[i].episode_id === episodeId) db.reports.splice(i, 1)
  }
  const idx = db.episodes.findIndex((row) => row.id === episodeId)
  if (idx !== -1) db.episodes.splice(idx, 1)
  return episode
}

/** Close the course. Notes and reports on this episode stay editable. */
export function dischargeLocalEpisode(episodeId: string, endDate?: string | null): AppEpisode {
  const idx = db.episodes.findIndex((row) => row.id === episodeId)
  if (idx === -1) throw new Error('Episode not found')
  const prev = asEpisode(db.episodes[idx])
  if (prev.status === 'discharged') return prev
  const now = new Date().toISOString()
  const next: AppEpisode = {
    ...prev,
    status: 'discharged',
    end_date: endDate || todayYmd(),
    updated_at: now,
  }
  db.episodes[idx] = next as unknown as StoreRecord
  return next
}
