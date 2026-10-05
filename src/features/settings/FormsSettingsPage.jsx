import { useNavigate } from 'react-router-dom'
import RecordTable from '../../components/RecordTable'
import { useChoose, useConfirm, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth/AuthProvider'
import { useAppClients } from '../../lib/queries'
import {
  useDeleteFormMutation,
  useDeleteMeasureMutation,
  useDuplicateFormMutation,
  useFormsQuery,
  useMeasuresQuery,
  useSendFormMutation,
  useSetFormScreenerMutation,
} from '../../lib/formQueries'
import { findActiveEpisode } from '../../lib/supabase/episodesRepo'
import { formEmbedCode, formFillUrl, formStartUrl } from '../forms/downloadCsv'
import RowMenu from '../forms/RowMenu'
import { SettingsSectionCard } from './SettingsPlaceholders'

function statusBadge(status) {
  const published = status === 'published'
  return <span className={`badge ${published ? 'badge-green' : 'badge-grey'}`}>{published ? 'Published' : 'Draft'}</span>
}

async function copyText(text) {
  await navigator.clipboard.writeText(text)
}

export default function FormsSettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const choose = useChoose()
  const { clients } = useAppClients()
  const { user } = useAuth()
  const userId = user?.id || ''
  const measuresQuery = useMeasuresQuery(userId)
  const formsQuery = useFormsQuery(userId)
  const removeMeasure = useDeleteMeasureMutation(userId)
  const removeForm = useDeleteFormMutation(userId)
  const duplicate = useDuplicateFormMutation(userId)
  const placeOnScreener = useSetFormScreenerMutation(userId)
  const send = useSendFormMutation('library')
  const measures = measuresQuery.data || []
  const forms = formsQuery.data || []

  const copy = async (text, message) => {
    try {
      await copyText(text)
      toast.saved(message)
    } catch (err) {
      toast.error(err.message || 'Could not copy')
    }
  }

  const sendForm = async (form) => {
    if (form.status !== 'published') {
      toast.error('Publish this form before sending it.')
      return
    }
    if (form.audience === 'public') {
      await copy(formStartUrl(form.id), 'Link copied. Put it on your website, or send it to someone new.')
      return
    }
    const options = (clients || []).filter((client) => client.is_active).map((client) => ({
      value: client.id,
      label: client.real_name,
    }))
    if (!options.length) {
      toast.error('Add a client before sending this form.')
      return
    }
    const clientId = await choose({
      title: 'Send a form',
      label: 'Client',
      confirmLabel: 'Copy link',
      options,
      defaultValue: options[0].value,
    })
    if (!clientId) return
    try {
      const episode = await findActiveEpisode(clientId)
      if (!episode) {
        toast.error('Open a course for this client before sending a form.')
        return
      }
      const client = clients.find((row) => row.id === clientId)
      const created = await send.mutateAsync({
        formId: form.id,
        clientId,
        episodeId: episode.id,
        organizationId: episode.organization_id || client?.workplace_id || null,
      })
      await copy(formFillUrl(created.token), 'Link copied. Send it to the client.')
    } catch (err) {
      toast.error(err.message || 'Could not send the form')
    }
  }

  const deleteMeasure = async (measure) => {
    const ok = await confirm({
      title: 'Delete this questionnaire?',
      message: 'This removes it from your list.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await removeMeasure.mutateAsync(measure.id)
      toast.saved('Questionnaire deleted')
    } catch (err) {
      toast.error(err.message || 'Could not delete the questionnaire')
    }
  }

  const deleteForm = async (form) => {
    const ok = await confirm({
      title: 'Delete this form?',
      message: 'If it has already been used, it is archived and the answers stay on the course.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const result = await removeForm.mutateAsync(form.id)
      toast.saved(result === 'archived'
        ? 'This form has been used, so it is archived. Answers already collected stay on the course.'
        : 'Form deleted')
    } catch (err) {
      toast.error(err.message || 'Could not delete the form')
    }
  }

  const measureRows = measures.map((measure) => ({
    id: measure.id,
    measure,
    filterValues: {
      name: measure.name,
      kind: measure.schema.kind === 'overall' ? 'One score' : 'Statements',
      status: measure.status === 'published' ? 'Published' : 'Draft',
    },
    sortValues: { name: measure.name },
    cells: {
      name: <span className="record-table__primary">{measure.name}</span>,
      kind: measure.schema.kind === 'overall' ? 'One score' : 'Statements',
      status: statusBadge(measure.status),
      menu: (
        <RowMenu
          label={`Actions for ${measure.name}`}
          items={[
            { label: 'View', onSelect: () => navigate(`/settings/forms/questionnaires/${measure.id}`) },
            { label: 'Delete', danger: true, onSelect: () => deleteMeasure(measure) },
          ]}
        />
      ),
    },
  }))

  const copyForm = async (form) => {
    try {
      await duplicate.mutateAsync(form.id)
      toast.saved('Copy saved as a draft')
    } catch (err) {
      toast.error(err.message || 'Could not copy the form')
    }
  }

  const toggleScreener = async (form) => {
    const next = !form.place_on_screener
    try {
      await placeOnScreener.mutateAsync({ id: form.id, placeOnScreener: next })
      toast.saved(next
        ? 'This form now places the person on the screener.'
        : 'This form no longer places the person on the screener.')
    } catch (err) {
      toast.error(err.message || 'Could not update the screener setting')
    }
  }

  const formRows = forms.map((form) => {
    const shared = form.audience === 'public'
    const kind = shared
      ? (form.place_on_screener ? 'Screener' : 'Shared link')
      : 'Send to a client'
    const view = { label: 'View', onSelect: () => navigate(`/settings/forms/edit/${form.id}`) }
    const remove = { label: 'Delete', danger: true, onSelect: () => deleteForm(form) }
    const share = (label, text, message) => ({
      label,
      onSelect: () => {
        if (form.status !== 'published') {
          toast.error('Publish this form before copying a link.')
          return
        }
        copy(text, message)
      },
    })
    const duplicateItem = { label: 'Duplicate', onSelect: () => copyForm(form) }
    const screenerItem = {
      label: form.place_on_screener ? 'Take off the screener' : 'Place the person on the screener',
      onSelect: () => toggleScreener(form),
    }
    const items = shared
      ? [
        view,
        screenerItem,
        share('Copy link', formStartUrl(form.id), 'Link copied.'),
        share('Copy embed', formEmbedCode(form.id, form.name), 'Embed code copied'),
        duplicateItem,
        remove,
      ]
      : [
        view,
        { label: 'Send', onSelect: () => sendForm(form) },
        duplicateItem,
        remove,
      ]
    return {
      id: form.id,
      form,
      filterValues: {
        name: form.name,
        kind,
        status: form.status === 'published' ? 'Published' : 'Draft',
      },
      sortValues: { name: form.name },
      cells: {
        name: <span className="record-table__primary">{form.name}</span>,
        kind,
        status: statusBadge(form.status),
        menu: <RowMenu label={`Actions for ${form.name}`} items={items} />,
      },
    }
  })

  return (
    <div className="section-card-stack">
      <SettingsSectionCard
        blockId="settings_measures"
        title="Questionnaires you track"
        description="Name the questionnaire, such as YP-CORE or CGAS. Save a draft while you design it, and publish it when it is ready to use."
      >
        <RecordTable
          headerAction={(
            <button
              type="button"
              className="secondary record-table__add"
              onClick={() => navigate('/settings/forms/questionnaires/new')}
            >
              Add a questionnaire
            </button>
          )}
          columns={[
            { key: 'name', label: 'Questionnaire', filter: 'text', sort: 'text' },
            { key: 'kind', label: 'Scoring', filter: 'choice', sort: 'text' },
            { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
            { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
          ]}
          rows={measureRows}
          countNoun="questionnaires"
          emptyMessage={measuresQuery.isPending ? 'Loading questionnaires…' : 'No questionnaires yet.'}
          onRowClick={(row) => navigate(`/settings/forms/questionnaires/${row.measure.id}`)}
        />
      </SettingsSectionCard>

      <SettingsSectionCard
        blockId="settings_forms"
        title="Forms"
        description="A form you send is added on a course. A shared form can be copied as a link or an embed. Open the form and use the settings wheel for the screener, auto fill, and email."
      >
        <RecordTable
          headerAction={(
            <button
              type="button"
              className="secondary record-table__add"
              onClick={() => navigate('/settings/forms/edit/new')}
            >
              Add a form
            </button>
          )}
          columns={[
            { key: 'name', label: 'Form', filter: 'text', sort: 'text' },
            { key: 'kind', label: 'Kind', filter: 'choice', sort: 'text' },
            { key: 'status', label: 'Status', filter: 'choice', sort: 'text' },
            { key: 'menu', label: '', sort: false, className: 'record-table__menu' },
          ]}
          rows={formRows}
          countNoun="forms"
          emptyMessage={formsQuery.isPending ? 'Loading forms…' : 'No forms yet.'}
          onRowClick={(row) => navigate(`/settings/forms/edit/${row.form.id}`)}
        />
        {(measuresQuery.error || formsQuery.error) && (
          <p className="form-error" role="alert">
            {measuresQuery.error?.message || formsQuery.error?.message}
          </p>
        )}
      </SettingsSectionCard>
    </div>
  )
}
