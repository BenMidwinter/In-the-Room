import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import FormOverlay from '../../components/FormOverlay'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
import { createTag, deleteTag, listTags, TAG_COLOURS, tagColourLabel } from '../../lib/supabase/screenerRepo'
import { SettingsSectionCard } from './SettingsPlaceholders'

function TagList({ kind, title, description }) {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLOURS[6].value)
  const [saving, setSaving] = useState(false)
  const tags = useQuery({
    queryKey: ['tags', kind],
    queryFn: () => listTags(kind),
    staleTime: 0,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tags', kind] })

  const close = () => {
    setOpen(false)
    setName('')
    setColor(TAG_COLOURS[6].value)
  }

  const add = async () => {
    setSaving(true)
    try {
      await createTag(kind, name, color)
      close()
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
      colour: (
        <span
          className="tag-swatch"
          style={{ background: tag.color }}
          title={tagColourLabel(tag.color)}
        />
      ),
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
    >
      <RecordTable
        headerAction={(
          <button type="button" className="secondary record-table__add" onClick={() => setOpen(true)}>
            Add
          </button>
        )}
        columns={[
          { key: 'colour', label: 'Colour', sort: false, className: 'record-table__col--swatch' },
          { key: 'name', label: 'Tag', filter: 'text', sort: 'text' },
          { key: 'remove', label: '', sort: false, className: 'record-table__col--actions' },
        ]}
        rows={rows}
        countNoun="tags"
        emptyMessage={tags.isPending ? 'Loading tags…' : 'No tags yet.'}
      />
      {open ? (
        <FormOverlay
          title="Add a tag"
          eyebrow={title}
          size="sm"
          onClose={close}
          footer={(
            <div className="form-actions">
              <button type="submit" form={`add-tag-${kind}`} className="primary" disabled={saving || !name.trim()}>
                {saving ? 'Adding…' : 'Add'}
              </button>
              <button type="button" className="secondary" onClick={close}>Cancel</button>
            </div>
          )}
        >
          <form
            id={`add-tag-${kind}`}
            onSubmit={(event) => {
              event.preventDefault()
              add()
            }}
          >
            <div className="form-group">
              <label htmlFor={`tag-name-${kind}`}>Name</label>
              <input
                id={`tag-name-${kind}`}
                className="paper-input"
                value={name}
                autoFocus
                placeholder="Urgent, assessment, school"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <fieldset className="form-group">
              <legend>Colour</legend>
              <div className="tag-colour-picker" role="radiogroup" aria-label="Tag colour">
                {TAG_COLOURS.map((swatch) => (
                  <button
                    key={swatch.value}
                    type="button"
                    className={color === swatch.value ? 'tag-colour-picker__swatch is-on' : 'tag-colour-picker__swatch'}
                    style={{ background: swatch.value }}
                    aria-label={swatch.label}
                    aria-pressed={color === swatch.value}
                    onClick={() => setColor(swatch.value)}
                  />
                ))}
              </div>
            </fieldset>
          </form>
        </FormOverlay>
      ) : null}
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
