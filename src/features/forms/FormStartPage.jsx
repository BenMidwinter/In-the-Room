import { Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { startOrResumePublicForm } from '../../lib/supabase/formsRepo'
import { FormShell } from './FormFillPage'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function FormStartPage() {
  const { formId = '' } = useParams()
  const valid = UUID.test(formId)
  const start = useQuery({
    queryKey: ['form-start', formId],
    queryFn: () => startOrResumePublicForm(formId),
    enabled: valid,
    staleTime: Infinity,
    retry: false,
  })

  if (!valid) {
    return <FormShell title="Form"><p>This form is not available.</p></FormShell>
  }
  if (start.isPending) {
    return <FormShell title="Form"><p>Opening this form…</p></FormShell>
  }
  if (start.error || !start.data) {
    return <FormShell title="Form"><p>{start.error?.message || 'This form is not available.'}</p></FormShell>
  }
  return <Navigate to={`/f/${start.data}`} replace />
}
