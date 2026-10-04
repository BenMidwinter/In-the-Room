import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
import { createTag, deleteTag, listTags } from '../../lib/supabase/screenerRepo'
import { SettingsSectionCard } from './SettingsPlaceholders'

function TagList({ kind, title, description }) {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const tags = useQuery({
    queryKey: ['tags', kind],
    queryFn: () => listTags(kind),
    staleTime: 0,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tags', kind] })

  const add = async () => {
    setSaving(true)
    try {
      await createTag(kind, name)
      setName('')
      toast.saved('Tag added')
      refresh()
    } catch (err) {
      toast.error(err.message || 'Could not add the tag')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tag) => {
    const ok = await confirm({
      title: 'Delete this tag?',
      message: 'It comes off anyone it was applied to.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteTag(tag.id)
      toast.saved('Tag deleted')
      refresh()
    } catch (err) {
      toast.error(err.message || 'Could not delete the tag')
    }
  }

  const rows = (tags.data || []).map((tag) => ({
    id: tag.id,
    filterValues: { name: tag.name },
    sortValues: { name: tag.name },
    cells: {
      name: <span className="record-table__primary">{tag.name}</span>,
      remove: (
        <button type="button" className="secondary" onClick={() => remove(tag)}>Delete</button>
      ),
    },
  }))

  return (
    <SettingsSectionCard
      blockId={`settings_tags_${kind}`}
      title={title}
      description={description}
      actions={(
        <form
          className="settings-inline-add"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <input
            className="paper-input"
            value={name}
            aria-label={`New ${title.toLowerCase()}`}
            placeholder="New tag"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="secondary" disabled={saving}>Add</button>
        </form>
      )}
    >
      <RecordTable
        columns={[
          { key: 'name', label: 'Tag', filter: 'text', sort: 'text' },
          { key: 'remove', label: '', sort: false, className: 'record-table__col--actions' },
        ]}
        rows={rows}
        countNoun="tags"
        emptyMessage={tags.isPending ? 'Loading tags…' : 'No tags yet.'}
      />
    </SettingsSectionCard>
  )
}

export default function TagsSettingsPage() {
  return (
    <div className="section-card-stack">
      <TagList
        kind="client"
        title="Client tags"
        description="Labels for people on your list. Use them however you sort your work."
      />
      <TagList
        kind="waitlist"
        title="Waitlist tags"
        description="Labels for the waitlist, so you can put urgent or specific referrals first."
      />
    </div>
  )
}
