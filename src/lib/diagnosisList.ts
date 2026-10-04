/** Preset diagnoses. Commas are kept out of the labels so a comma-separated save does not split one diagnosis into several. */
export const DIAGNOSIS_OPTIONS = [
  'ADHD',
  'Anxiety',
  'Attachment Disorder',
  'Autism Spectrum Condition (ASC)',
  'Global Developmental Delay',
  'Obsessive Compulsive Disorder (OCD)',
  'Oppositional Defiant Disorder (ODD)',
  'PDA Profile',
  'PMLD',
  'Social Emotional and Mental Health (SEMH)',
  'Speech Language and Communication Needs (SLCN)',
  'Trauma / ACEs',
].sort()

const LEGACY_DIAGNOSES: Array<[string, string]> = [
  ['Social, Emotional and Mental Health (SEMH)', 'Social Emotional and Mental Health (SEMH)'],
  ['Speech, Language and Communication Needs (SLCN)', 'Speech Language and Communication Needs (SLCN)'],
]

export function parseDiagnosisList(value: string | null | undefined): string[] {
  if (!value?.trim()) return []
  let text = value
  for (const [from, to] of LEGACY_DIAGNOSES) {
    text = text.split(from).join(to)
  }
  return text.split(',').map((item) => item.trim()).filter(Boolean)
}

export function joinDiagnosisList(selected: Array<string | null | undefined>): string {
  return selected
    .map((item) => String(item || '').replace(/,/g, '').trim())
    .filter(Boolean)
    .join(', ')
}
