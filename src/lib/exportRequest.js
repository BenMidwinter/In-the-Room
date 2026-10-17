import { invokeFunction } from './supabase/invokeFunction'

function supabasePublic() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase is not configured')
  return { url, key }
}

export function requestDataExport(body) {
  return invokeFunction('export-data', { body: { action: 'request', ...body } })
}

export function listDataExports() {
  return invokeFunction('export-data', { body: { action: 'list' } })
}

/** Collects the zip once. Opening the page does not call this. */
export async function downloadExportFile(token) {
  const { url, key } = supabasePublic()
  const response = await fetch(`${url}/functions/v1/export-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ action: 'download', token }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'This download is no longer available.')
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = 'process-and-note-export.zip'
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
