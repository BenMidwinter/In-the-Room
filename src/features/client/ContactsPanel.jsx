import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import RecordListLayout from '../../components/RecordListLayout'
import RecordTable from '../../components/RecordTable'
import { useConfirm, useToast } from '../../components/ui'
import { useClientSession } from '../../lib/useClientSession'
import { deleteContact, listContacts, saveContact } from '../../lib/supabase/contactsRepo'

const ROLES = [
  { value: 'parent', label: 'Parent' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'referrer', label: 'Referrer' },
  { value: 'gp', label: 'GP' },
  { value: 'school', label: 'School' },
  { value: 'billing', label: 'Billing' },
  { value: 'other', label: 'Other' },
]

const EMPTY = { id: '', name: '', email: '', phone: '', role: 'other', sendInvoices: false }

export default function ContactsPanel() {
  const { clientId } = useClientSession()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const query = useQuery({
    queryKey: ['contacts', clientId],
    queryFn: () => listContacts(clientId),
    enabled: Boolean(clientId),
  })
  const contacts = query.data || []

  function openNew() {
    setForm({ ...EMPTY })
  }

  function openExisting(contact) {
    setForm({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      sendInvoices: contact.sendInvoices,
    })
  }

  async function onSave(event) {
    event.preventDefault()
    if (!form || !clientId) return
    setBusy(true)
    try {
      await saveContact({ ...form, clientId })
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setForm(null)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not save this contact')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!form?.id) return
    const ok = await confirm({
      title: 'Delete this contact?',
      message: 'Invoices will go back to the client email if nobody else is flagged.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteContact(form.id)
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setForm(null)
      toast.saved()
    } catch (err) {
      toast.error(err?.message || 'Could not delete this contact')
    } finally {
      setBusy(false)
    }
  }

  const rows = contacts.map((contact) => ({
    id: contact.id,
    contact,
    filterValues: { name: contact.name, role: roleLabel(contact.role), email: contact.email },
    sortValues: { name: contact.name, role: roleLabel(contact.role) },
    cells: {
      name: contact.name,
      role: roleLabel(contact.role),
      email: contact.email || '—',
      invoices: contact.sendInvoices ? 'Send invoices to' : '—',
    },
  }))

  return (
    <RecordListLayout
      title="Contacts"
      subtitle="Invoices go to the client unless a contact is marked Send invoices to."
      newLabel={form ? '' : 'contact'}
      onNew={openNew}
    >
      {form && (
        <form className="settings-form" onSubmit={onSave}>
          <label className="settings-form__field">
            <span>Name</span>
            <input className="paper-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="settings-form__field">
            <span>Email</span>
            <input className="paper-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label className="settings-form__field">
            <span>Phone</span>
            <input className="paper-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label className="settings-form__field">
            <span>Relationship</span>
            <select className="paper-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>
          <label className="settings-form__field">
            <span>Invoices</span>
            <span className="contact-invoice-flag">
              <input
                type="checkbox"
                checked={form.sendInvoices}
                onChange={(event) => setForm({ ...form, sendInvoices: event.target.checked })}
              />
              Send invoices to this contact
            </span>
          </label>
          <div className="settings-form__actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>Save contact</button>
            <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            {form.id && (
              <button type="button" className="btn btn-secondary" onClick={onDelete} disabled={busy}>Delete</button>
            )}
          </div>
        </form>
      )}
      <RecordTable
        columns={[
          { key: 'name', label: 'Name', filter: 'text' },
          { key: 'role', label: 'Relationship', filter: 'choice' },
          { key: 'email', label: 'Email', filter: 'text' },
          { key: 'invoices', label: 'Invoices', filter: 'choice' },
        ]}
        rows={rows}
        onRowClick={(row) => openExisting(row.contact)}
        emptyMessage="No contacts yet."
        countNoun="contacts"
      />
    </RecordListLayout>
  )
}

function roleLabel(role) {
  return ROLES.find((item) => item.value === role)?.label || 'Other'
}
