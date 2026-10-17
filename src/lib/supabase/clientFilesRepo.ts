import { getSupabase } from './client'
import type { Tables } from './database.types'
import { invokeFunction } from './invokeFunction'

export type ClientFileRow = Tables<'client_files'>

const MAX_BYTES = 20 * 1024 * 1024

type UploadTicket = {
  fileId: string
  s3Key: string
  fileType: string
  organizationId: string | null
  uploadUrl: string
  headers: Record<string, string>
}

export async function listClientFiles(clientId: string): Promise<ClientFileRow[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('client_files')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function uploadClientFile(clientId: string, file: File): Promise<ClientFileRow> {
  if (!file || file.size <= 0 || file.size > MAX_BYTES) throw new Error('Choose a file up to 20 MB.')
  const ticket = await invokeFunction<UploadTicket>('client-files', {
    body: {
      action: 'upload',
      clientId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    },
  })
  const stored = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: ticket.headers,
    body: file,
  })
  if (!stored.ok) throw new Error('The file could not be stored.')

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('Sign in required')
  const { data, error } = await supabase.from('client_files').insert({
    id: ticket.fileId,
    client_id: clientId,
    owner_id: userData.user.id,
    organization_id: ticket.organizationId,
    file_name: file.name.trim().slice(0, 200),
    file_type: ticket.fileType,
    file_size_bytes: file.size,
    s3_key: ticket.s3Key,
  }).select('*').single()
  if (error || !data) throw new Error(error?.message || 'The file record could not be saved.')
  return data
}

export async function downloadClientFile(fileId: string): Promise<void> {
  const ticket = await invokeFunction<{ downloadUrl: string }>('client-files', {
    body: { action: 'download', fileId },
  })
  window.location.assign(ticket.downloadUrl)
}

export async function deleteClientFile(fileId: string): Promise<void> {
  await invokeFunction('client-files', { body: { action: 'delete', fileId } })
}
