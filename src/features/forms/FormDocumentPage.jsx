import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import LetterheadPreview from '../client/LetterheadPreview'
import { useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { downloadFormPdf } from '../../lib/clinicalExport'
import { formDocumentBlocks, formDocumentBodyHtml } from '../../lib/formDocument'
import { loadClinicianPrintIdentity, printLetterheadFromRow } from '../../lib/letterheadPrint'
import { getFormDocument } from '../../lib/supabase/formsRepo'
import { listLetterheads } from '../../lib/supabase/letterheadsRepo'

export default function FormDocumentPage() {
  const { clientId = '', submissionId = '' } = useParams()
  const toast = useToast()
  const { user } = useAuth()
  const documentQuery = useQuery({
    queryKey: ['form-document', submissionId],
    queryFn: () => getFormDocument(submissionId),
    enabled: Boolean(submissionId),
  })
  const letterheadsQuery = useQuery({
    queryKey: ['letterheads', user?.id],
    queryFn: listLetterheads,
    enabled: Boolean(user?.id),
  })
  const identityQuery = useQuery({
    queryKey: ['print-identity', user?.id],
    queryFn: () => loadClinicianPrintIdentity(user.id),
    enabled: Boolean(user?.id),
  })
  const doc = documentQuery.data
  const letterheadRow = (letterheadsQuery.data || []).find((row) => row.id === doc?.letterheadId) || null
  const letterhead = letterheadRow && identityQuery.data
    ? printLetterheadFromRow(letterheadRow, identityQuery.data)
    : null
  const blocks = doc ? formDocumentBlocks(doc.schema, doc.answers, doc.measures) : []

  const download = async () => {
    if (!doc) return
    try {
      await downloadFormPdf({
        title: doc.title,
        letterhead: letterhead || undefined,
        bodyHtml: formDocumentBodyHtml(blocks),
      })
    } catch (err) {
      toast.error(err.message || 'Could not download the PDF')
    }
  }

  if (documentQuery.isPending) {
    return <div className="page"><p className="text-muted">Opening the form…</p></div>
  }
  if (documentQuery.error || !doc) {
    return <div className="page"><p>{documentQuery.error?.message || 'This form could not be opened.'}</p></div>
  }

  return (
    <div className="page form-document">
      <div className="form-document__bar">
        <Link className="secondary" to={clientId ? `/clients/${clientId}` : '/screener'}>Back</Link>
        <button type="button" className="primary" onClick={download}>Download PDF</button>
      </div>
      <article className="form-document__sheet">
        <LetterheadPreview letterhead={letterhead} />
        <h1>{doc.title}</h1>
        {blocks.map((block, index) => (
          block.kind === 'prose'
            ? <p key={index} className="form-fill__prose">{block.text}</p>
            : (
              <div key={index} className="form-question">
                <p className="form-question__label">{block.label}</p>
                <p className="form-question__answer">{block.text}</p>
              </div>
            )
        ))}
      </article>
    </div>
  )
}
