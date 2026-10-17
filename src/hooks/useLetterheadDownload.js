import { useCallback } from 'react'
import { useChoose } from '../components/ui'
import { useAuth } from '../lib/auth/AuthProvider'
import {
  downloadLetterPdf,
  downloadProgressNotePdf,
  downloadRichDocumentPdf,
} from '../lib/clinicalExport'
import { loadClinicianPrintIdentity, resolveDownloadLetterhead } from '../lib/letterheadPrint'
import { listLetterheads } from '../lib/supabase/letterheadsRepo'

/**
 * Same letterhead step as Process Note download: use the only letterhead,
 * or ask when there are several. Returns false if the clinician cancels.
 */
export function useLetterheadDownload() {
  const choose = useChoose()
  const { user } = useAuth()

  const pickLetterhead = useCallback(async () => {
    const identity = await loadClinicianPrintIdentity(user?.id)
    return resolveDownloadLetterhead(await listLetterheads(), choose, identity)
  }, [choose, user?.id])

  const downloadDocument = useCallback(async (payload, letterhead) => {
    const head = letterhead || await pickLetterhead()
    if (!head) return false
    return downloadRichDocumentPdf({ ...payload, letterhead: head })
  }, [pickLetterhead])

  const downloadLetter = useCallback(async (letter, meta = {}, letterhead) => {
    const head = letterhead || await pickLetterhead()
    if (!head) return false
    return downloadLetterPdf(letter, { ...meta, letterhead: head })
  }, [pickLetterhead])

  const downloadNote = useCallback(async (note, meta = {}, letterhead) => {
    const head = letterhead || await pickLetterhead()
    if (!head) return false
    return downloadProgressNotePdf(note, { ...meta, letterhead: head })
  }, [pickLetterhead])

  return { pickLetterhead, downloadDocument, downloadLetter, downloadNote }
}
