/** Therapy modality styling for calendar events (Tailwind class maps — legacy fallback). */

import { appointmentServiceLabel as resolveServiceLabel } from './calendarServiceStyles'

export const THERAPY_MODALITIES = {
  clay_work: {
    id: 'clay_work',
    label: 'Clay Work',
    chip: 'bg-amber-100 text-amber-950 border-amber-300',
    event: 'bg-amber-50 border-l-4 border-amber-400 text-amber-950 hover:bg-amber-100',
    dot: 'bg-amber-400',
  },
  music_therapy: {
    id: 'music_therapy',
    label: 'Music Therapy',
    chip: 'bg-sky-100 text-sky-950 border-sky-300',
    event: 'bg-sky-50 border-l-4 border-sky-400 text-sky-950 hover:bg-sky-100',
    dot: 'bg-sky-400',
  },
  somatic_expression: {
    id: 'somatic_expression',
    label: 'Somatic Expression',
    chip: 'bg-violet-100 text-violet-950 border-violet-300',
    event: 'bg-violet-50 border-l-4 border-violet-400 text-violet-950 hover:bg-violet-100',
    dot: 'bg-violet-400',
  },
}

export function modalityStyles(modalityId) {
  return THERAPY_MODALITIES[modalityId] || THERAPY_MODALITIES.music_therapy
}

export function modalityLabel(modalityId) {
  return resolveServiceLabel(modalityId)
}
