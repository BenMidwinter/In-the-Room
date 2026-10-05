import { useEffect, useState } from 'react'
import { SettingsSectionCard } from './SettingsPlaceholders'
import { deleteService, listServices, upsertService } from '../../lib/supabase/servicesRepo'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { writeAuditEvent } from '../../lib/supabase/audit'
import { useConfirm, useToast } from '../../components/ui'
import FormOverlay from '../../components/FormOverlay'
import RecordTable from '../../components/RecordTable'
import { SERVICE_COLOR_PRESETS, normalizeServiceColor } from '../../lib/serviceColors'
import { feePenceToInput, formatServiceFee, parseFeePounds } from '../../lib/money'

const TYPE_LABELS = {
  appointment: 'Appointment',
  support: 'Support',
  admin: 'Admin',
  busy: 'Busy',
}

const SERVICE_COLUMNS = [
  { key: 'name', label: 'Service', filter: 'text' },
  { key: 'type', label: 'Type', filter: 'choice' },
  { key: 'duration', label: 'Duration', sort: 'number' },
  { key: 'price', label: 'Price', sort: 'number' },
  { key: 'follow', label: 'Follow-on', filter: 'text' },
  { key: 'meet', label: 'Meet', filter: 'choice' },
  { key: 'status', label: 'Status', filter: 'choice' },
  { key: 'actions', label: '', sort: false },
]

const EMPTY_FORM = {
  id: '',
  name: '',
  slug: '',
  service_type: 'appointment',
  default_duration_minutes: 50,
  follow_on_service_id: '',
  follow_on_duration_minutes: 10,
  buffer_minutes: 0,
  color: '#263e34',
  create_meet_link: false,
  fee_pounds: '',
  fee_includes_vat: false,
  is_active: true,
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug.length >= 2 ? slug : `service_${Date.now().toString(36)}`
}

function toForm(service) {
  return {
    id: service.id,
    name: service.name || '',
    slug: service.slug || '',
    service_type: service.service_type || 'appointment',
    default_duration_minutes: service.default_duration_minutes ?? 50,
    follow_on_service_id: service.follow_on_service_id || '',
    follow_on_duration_minutes: service.follow_on_duration_minutes ?? 10,
    buffer_minutes: service.buffer_minutes ?? 0,
    color: service.color || '#263e34',
    create_meet_link: Boolean(service.create_meet_link),
    fee_pounds: feePenceToInput(service.fee_pence),
    fee_includes_vat: Boolean(service.fee_includes_vat) && service.fee_pence != null,
    is_active: service.is_active !== false,
  }
}

export default function ServicesSettingsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [services, setServices] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const editing = Boolean(form?.id)
  const overlayOpen = Boolean(form)

  const reload = async () => {
    if (!isSupabaseConfigured()) return
    setServices(await listServices())
  }

  useEffect(() => {
    reload().catch((err) => setError(err.message))
  }, [])

  const supportServices = services.filter(
    (s) => (s.service_type === 'support' || s.service_type === 'admin') && s.id !== form?.id,
  )

  const closeOverlay = () => {
    setForm(null)
    setError(null)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      const slug = form.slug || slugify(form.name)
      const fee = parseFeePounds(form.fee_pounds)
      if (fee.error) {
        setError(fee.error)
        return
      }
      await upsertService({
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        slug,
        service_type: form.service_type,
        default_duration_minutes: Number(form.default_duration_minutes) || 50,
        follow_on_service_id: form.follow_on_service_id || null,
        follow_on_duration_minutes: form.follow_on_service_id
          ? Number(form.follow_on_duration_minutes) || null
          : null,
        buffer_minutes: Number(form.buffer_minutes) || 0,
        color: normalizeServiceColor(form.color, form.service_type),
        create_meet_link: Boolean(form.create_meet_link),
        fee_pence: fee.pence,
        fee_includes_vat: fee.pence != null && form.fee_includes_vat,
        is_active: form.is_active !== false,
      })
      closeOverlay()
      await reload()
      toast.saved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const startCreate = () => {
    setForm({ ...EMPTY_FORM })
    setError(null)
  }

  const startEdit = (service) => {
    setForm(toForm(service))
    setError(null)
  }

  const removeService = async (service) => {
    const ok = await confirm({
      title: 'Delete service?',
      message: `Remove “${service.name}”? Existing appointments keep their times; this only removes the service type.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteService(service.id)
      if (form?.id === service.id) closeOverlay()
      await reload()
      toast.saved('Deleted')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleMeet = async (service) => {
    try {
      await upsertService({
        id: service.id,
        name: service.name,
        slug: service.slug,
        service_type: service.service_type,
        default_duration_minutes: service.default_duration_minutes,
        follow_on_service_id: service.follow_on_service_id,
        follow_on_duration_minutes: service.follow_on_duration_minutes,
        buffer_minutes: service.buffer_minutes,
        color: service.color,
        create_meet_link: !service.create_meet_link,
        fee_pence: service.fee_pence ?? null,
        fee_includes_vat: Boolean(service.fee_includes_vat),
        is_active: service.is_active,
      })
      await writeAuditEvent({
        action: 'service.meet_toggled',
        entityType: 'service',
        entityId: service.id,
        metadata: { create_meet_link: !service.create_meet_link },
      })
      await reload()
      toast.saved()
    } catch (err) {
      setError(err.message)
    }
  }

  const serviceRows = services.map((service) => {
    const typeLabel = TYPE_LABELS[service.service_type] || service.service_type || 'Service'
    const followOn = services.find((item) => item.id === service.follow_on_service_id)
    const followLabel = followOn
      ? `${followOn.name}${service.follow_on_duration_minutes ? ` · ${service.follow_on_duration_minutes}m` : ''}`
      : ''
    const active = service.is_active !== false
    const meetLabel = service.service_type === 'appointment'
      ? (service.create_meet_link ? 'On' : 'Off')
      : ''
    const priceLabel = formatServiceFee(service.fee_pence, service.fee_includes_vat)
    return {
      id: service.id,
      service,
      muted: !active,
      filterValues: {
        name: service.name,
        type: typeLabel,
        follow: followLabel,
        meet: meetLabel,
        status: active ? 'Active' : 'Inactive',
      },
      sortValues: {
        name: service.name,
        type: typeLabel,
        duration: Number(service.default_duration_minutes) || 0,
        price: service.fee_pence == null ? -1 : Number(service.fee_pence),
        follow: followLabel,
        status: active ? 'Active' : 'Inactive',
      },
      cells: {
        name: (
          <span className="settings-service-name">
            <span
              className="settings-service-list__swatch"
              style={{ background: service.color || '#557a61' }}
              aria-hidden
            />
            <span className="record-table__primary">{service.name}</span>
          </span>
        ),
        type: typeLabel,
        duration: `${service.default_duration_minutes}m`,
        price: priceLabel || <span className="record-table__cell-muted">—</span>,
        follow: followLabel || <span className="record-table__cell-muted">—</span>,
        meet: service.service_type === 'appointment' ? (
          <button
            type="button"
            className="record-table__inline"
            onClick={(event) => {
              event.stopPropagation()
              toggleMeet(service)
            }}
          >
            {service.create_meet_link ? 'On' : 'Off'}
          </button>
        ) : (
          <span className="record-table__cell-muted">—</span>
        ),
        status: active
          ? <span className="badge badge-green">Active</span>
          : <span className="badge badge-grey">Inactive</span>,
        actions: (
          <button
            type="button"
            className="record-table__inline record-table__inline--danger"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              removeService(service)
            }}
          >
            Delete
          </button>
        ),
      },
    }
  })

  return (
    <div className="section-card-stack">
      <SettingsSectionCard blockId="settings_services" title="Services">
        <div className="settings-services-toolbar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={startCreate}
            disabled={!isSupabaseConfigured() || busy}
          >
            + New Service
          </button>
        </div>

        {!isSupabaseConfigured() && (
          <p className="auth-page__alert">Supabase env vars required to manage services.</p>
        )}
        {error && !overlayOpen && (
          <p className="auth-page__alert" role="alert">{error}</p>
        )}

        <RecordTable
          columns={SERVICE_COLUMNS}
          rows={serviceRows}
          countNoun="services"
          emptyMessage="No services yet. Use New Service to add one."
          onRowClick={(row) => startEdit(row.service)}
        />
      </SettingsSectionCard>

      {overlayOpen && form && (
        <FormOverlay
          title={editing ? 'Edit service' : 'New service'}
          eyebrow="Services"
          meta={editing ? form.name : 'Create an appointment type or support block'}
          onClose={closeOverlay}
          size="md"
        >
          <form className="settings-form" onSubmit={onSubmit}>
            <label className="settings-form__field">
              <span>Name</span>
              <input
                className="paper-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  slug: editing ? f.slug : (f.slug || slugify(e.target.value)),
                }))}
                required
                autoFocus
              />
            </label>
            <label className="settings-form__field">
              <span>Type</span>
              <select
                className="paper-input"
                value={form.service_type}
                onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
              >
                <option value="appointment">Appointment</option>
                <option value="support">Support activity</option>
                <option value="admin">Admin</option>
                <option value="busy">Busy</option>
              </select>
            </label>
            <label className="settings-form__field">
              <span>Client-facing duration (minutes)</span>
              <input
                className="paper-input"
                type="number"
                min={5}
                value={form.default_duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, default_duration_minutes: e.target.value }))}
                required
              />
            </label>
            <div className="settings-form__field">
              <span>Price (£)</span>
              <input
                className="paper-input"
                inputMode="decimal"
                placeholder="80.00"
                value={form.fee_pounds}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  fee_pounds: e.target.value,
                  fee_includes_vat: e.target.value.trim() ? f.fee_includes_vat : false,
                }))}
              />
              <p className="settings-form__hint">Leave blank if this service is not billed.</p>
            </div>
            <label className="settings-service-list__meet">
              <input
                type="checkbox"
                checked={Boolean(form.fee_includes_vat)}
                disabled={!String(form.fee_pounds || '').trim()}
                onChange={(e) => setForm((f) => ({ ...f, fee_includes_vat: e.target.checked }))}
              />
              Price includes VAT
            </label>
            <p className="settings-form__hint">
              Turn this on when the price already includes VAT. Leave it off if you are not VAT registered, or if VAT is added on top.
            </p>
            <div className="settings-form__field">
              <span>Colour</span>
              <div className="settings-service-colors">
                {SERVICE_COLOR_PRESETS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={`settings-service-colors__swatch${form.color === hex ? ' settings-service-colors__swatch--active' : ''}`}
                    style={{ background: hex }}
                    aria-label={`Use colour ${hex}`}
                    aria-pressed={form.color === hex}
                    onClick={() => setForm((f) => ({ ...f, color: hex }))}
                  />
                ))}
                <label className="settings-service-colors__custom">
                  <span className="text-small text-muted">Custom</span>
                  <input
                    type="color"
                    value={normalizeServiceColor(form.color, form.service_type)}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  />
                </label>
              </div>
            </div>
            {form.service_type === 'appointment' && (
              <>
                <label className="settings-form__field">
                  <span>Follow-on support service</span>
                  <select
                    className="paper-input"
                    value={form.follow_on_service_id}
                    onChange={(e) => setForm((f) => ({ ...f, follow_on_service_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {supportServices.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                {form.follow_on_service_id && (
                  <label className="settings-form__field">
                    <span>Follow-on duration (minutes)</span>
                    <input
                      className="paper-input"
                      type="number"
                      min={5}
                      value={form.follow_on_duration_minutes}
                      onChange={(e) => setForm((f) => ({ ...f, follow_on_duration_minutes: e.target.value }))}
                    />
                  </label>
                )}
                <label className="settings-service-list__meet">
                  <input
                    type="checkbox"
                    checked={form.create_meet_link}
                    onChange={(e) => setForm((f) => ({ ...f, create_meet_link: e.target.checked }))}
                  />
                  Create Google Meet link when this type is booked
                </label>
              </>
            )}
            {error && <p className="auth-page__alert" role="alert">{error}</p>}
            <div className="settings-form__actions">
              <button type="button" className="btn btn-secondary" onClick={closeOverlay} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !isSupabaseConfigured()}>
                {busy ? 'Saving…' : editing ? 'Save service' : 'Create service'}
              </button>
            </div>
          </form>
        </FormOverlay>
      )}
    </div>
  )
}
