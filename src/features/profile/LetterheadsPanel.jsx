import { useEffect, useMemo, useState } from 'react'
import RoleBlockShell from '../../components/RoleBlockShell'
import LetterheadBrandingForm from '../../components/LetterheadBrandingForm'
import { resolvePracticeBranding } from '../../lib/workplaceBranding'
import {
  deleteLetterhead,
  listLetterheads,
  upsertLetterhead,
} from '../../lib/supabase/letterheadsRepo'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { useConfirm, useToast } from '../../components/ui'

const EMPTY = {
  id: '',
  name: '',
  practice_name: '',
  logo_url: '',
  address_line1: '',
  address_line2: '',
  address_line3: '',
  postcode: '',
  country: '',
  is_default: false,
}

function toForm(row) {
  return {
    id: row.id || '',
    name: row.name || '',
    practice_name: row.practice_name || '',
    logo_url: row.logo_url || '',
    address_line1: row.address_line1 || '',
    address_line2: row.address_line2 || '',
    address_line3: row.address_line3 || '',
    postcode: row.postcode || '',
    country: row.country || '',
    is_default: Boolean(row.is_default),
  }
}

export default function LetterheadsPanel() {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    if (!isSupabaseConfigured()) return
    const next = await listLetterheads()
    setRows(next)
    return next
  }

  useEffect(() => {
    reload().catch((err) => setError(err.message))
  }, [])

  const previewBranding = useMemo(() => {
    if (!form) return resolvePracticeBranding({})
    return resolvePracticeBranding({
      practice_name: form.practice_name || form.name,
      practice_logo_url: form.logo_url || null,
      practice_address_line1: form.address_line1,
      practice_address_line2: form.address_line2,
      practice_address_line3: form.address_line3,
      practice_postcode: form.postcode,
      practice_country: form.country,
    })
  }, [form])

  const openNew = () => {
    setError('')
    setForm({ ...EMPTY, name: 'New letterhead' })
  }

  const openExisting = (row) => {
    setError('')
    setForm(toForm(row))
  }

  const closeEditor = () => {
    setForm(null)
    setError('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form) return
    setBusy(true)
    setError('')
    try {
      const saved = await upsertLetterhead({
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim() || form.practice_name.trim() || 'Letterhead',
        practice_name: form.practice_name,
        logo_url: form.logo_url,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        address_line3: form.address_line3,
        postcode: form.postcode,
        country: form.country,
        is_default: form.is_default || rows.length === 0,
      })
      await reload()
      setForm(toForm(saved))
      toast.saved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!form?.id) {
      closeEditor()
      return
    }
    const ok = await confirm({
      title: 'Delete letterhead?',
      message: `Remove “${form.name}”?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await deleteLetterhead(form.id)
      const next = await reload()
      setForm(next[0] ? toForm(next[0]) : null)
      toast.saved('Deleted')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toolbar = (
    <>
      <button
        type="button"
        className="btn btn-secondary role-block__toolbar-new"
        onClick={openNew}
        disabled={busy || !isSupabaseConfigured()}
      >
        + New Letterhead
      </button>
      <div className="role-block__toolbar-list">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`role-block__toolbar-item${form?.id === row.id ? ' role-block__toolbar-item--active' : ''}`}
            onClick={() => openExisting(row)}
          >
            {row.name || row.practice_name || 'Letterhead'}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <RoleBlockShell
      blockId="profile_letterhead"
      title="Letterheads"
      description="Practice letterheads for letters and clinical exports. Select one to edit, or create another."
      toolbar={toolbar}
    >
      <div className="role-block__panel">
        {!isSupabaseConfigured() && (
          <p className="auth-page__alert">Supabase env vars required to manage letterheads.</p>
        )}

        {!form && (
          <p className="text-muted" style={{ margin: 0 }}>
            {rows.length
              ? 'Select a letterhead above to edit it.'
              : 'No letterheads yet — use + New Letterhead to create one.'}
          </p>
        )}

        {form && (
          <LetterheadBrandingForm
            displayName={previewBranding.name}
            logoUrl={form.logo_url}
            addressLine1={form.address_line1}
            addressLine2={form.address_line2}
            addressLine3={form.address_line3}
            postcode={form.postcode}
            country={form.country}
            onLogoUrlChange={(value) => setForm((f) => ({ ...f, logo_url: value }))}
            onAddressLine1Change={(value) => setForm((f) => ({ ...f, address_line1: value }))}
            onAddressLine2Change={(value) => setForm((f) => ({ ...f, address_line2: value }))}
            onAddressLine3Change={(value) => setForm((f) => ({ ...f, address_line3: value }))}
            onPostcodeChange={(value) => setForm((f) => ({ ...f, postcode: value }))}
            onCountryChange={(value) => setForm((f) => ({ ...f, country: value }))}
            previewBranding={previewBranding}
            error={error}
            savedMessage=""
            saving={busy}
            saveLabel={form.id ? 'Save letterhead' : 'Create letterhead'}
            onSubmit={handleSave}
            practiceNameField={(
              <>
                <label className="letterhead-branding__field">
                  <span className="letterhead-branding__label">Letterhead name</span>
                  <input
                    type="text"
                    className="paper-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Private practice"
                    required
                  />
                </label>
                <label className="letterhead-branding__field">
                  <span className="letterhead-branding__label">Practice name on letterhead</span>
                  <input
                    type="text"
                    className="paper-input"
                    value={form.practice_name}
                    onChange={(e) => setForm((f) => ({ ...f, practice_name: e.target.value }))}
                    placeholder="Printed organisation name"
                  />
                </label>
                <label className="settings-service-list__meet" style={{ marginTop: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                  />
                  Default letterhead
                </label>
              </>
            )}
          />
        )}

        {form && (
          <div className="settings-form__actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={closeEditor} disabled={busy}>
              Close
            </button>
            {form.id && (
              <button type="button" className="btn btn-secondary" onClick={handleDelete} disabled={busy}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </RoleBlockShell>
  )
}
