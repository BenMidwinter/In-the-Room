import { useEffect, useMemo, useState } from 'react'
import {
  getAppointmentOrgServices,
  getClinicianLocationsForUser,
  getClinicianWorkplaceSettings,
  updateClinicianWorkplaceSettings,
} from '../../lib/store'
import {
  WEEKDAYS,
  applyDayHoursWithOverlapResolution,
  getSettingsForLocation,
  mergeSettingsForLocations,
} from '../../lib/clinicianAvailability'
import { listAvailabilitySettings, saveAvailabilitySettings } from '../../lib/supabase/availabilityRepo'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { listServices as listRemoteServices } from '../../lib/supabase/servicesRepo'
import { useToast } from '../../components/ui'

function formatMemberRole(role) {
  return String(role || '').replace(/_/g, ' ')
}

function LocationAvailabilityEditor({
  setting,
  services,
  onDayChange,
  onServiceToggle,
}) {
  return (
    <div className="profile-availability__editor">
      <div className="profile-availability__hours-wrap">
        <p className="profile-availability__section-label">Working hours</p>
        <ul className="profile-availability__hours">
          {WEEKDAYS.map(day => {
            const hours = setting.weekly_hours[day.key]
            return (
              <li key={day.key} className="profile-availability__hours-row">
                <label className="profile-availability__day-toggle">
                  <input
                    type="checkbox"
                    checked={hours.enabled}
                    onChange={e => onDayChange(day.key, { enabled: e.target.checked })}
                  />
                  <span>{day.short}</span>
                </label>
                <input
                  type="time"
                  className="paper-input paper-input--compact"
                  value={hours.start}
                  disabled={!hours.enabled}
                  onChange={e => onDayChange(day.key, { start: e.target.value })}
                  aria-label={`${day.label} start`}
                />
                <span className="profile-availability__hours-sep" aria-hidden>–</span>
                <input
                  type="time"
                  className="paper-input paper-input--compact"
                  value={hours.end}
                  disabled={!hours.enabled}
                  onChange={e => onDayChange(day.key, { end: e.target.value })}
                  aria-label={`${day.label} end`}
                />
              </li>
            )
          })}
        </ul>
      </div>

      <div className="profile-availability__services">
        <p className="profile-availability__section-label">Services offered here</p>
        {services.length === 0 ? (
          <p className="text-small text-muted">No appointment services configured yet.</p>
        ) : (
          <ul className="profile-availability__service-list">
            {services.map(service => (
              <li key={service.id}>
                <label className="profile-availability__service-item">
                  <input
                    type="checkbox"
                    checked={setting.service_ids.includes(service.id)}
                    onChange={e => onServiceToggle(service.id, e.target.checked)}
                  />
                  <span
                    className="profile-availability__service-swatch"
                    style={{ backgroundColor: service.color || 'var(--col-primary)' }}
                    aria-hidden
                  />
                  <span className="profile-availability__service-copy">
                    <strong>{service.name}</strong>
                    {service.description && (
                      <span className="text-small text-muted">{service.description}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function ProfileAvailabilityPanel({ userId, onSaved }) {
  const toast = useToast()
  const locations = useMemo(() => getClinicianLocationsForUser(userId), [userId])
  const locationIds = useMemo(() => locations.map(loc => loc.id), [locations])
  const locationNameById = useMemo(
    () => Object.fromEntries(locations.map(loc => [loc.id, loc.name])),
    [locations],
  )

  const [services, setServices] = useState(() => getAppointmentOrgServices())
  const [settings, setSettings] = useState([])
  const [activeLocationId, setActiveLocationId] = useState('')
  const [overlapNote, setOverlapNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function load() {
      setError('')
      let remote = []
      if (isSupabaseConfigured()) {
        try {
          remote = await listAvailabilitySettings()
          const remoteServices = await listRemoteServices()
          if (!cancelled && remoteServices.length) {
            setServices(remoteServices.filter((s) => s.service_type === 'appointment' || !s.service_type))
          }
        } catch (err) {
          if (!cancelled) setError(err.message)
        }
      }
      if (cancelled) return
      const local = getClinicianWorkplaceSettings(userId)
      const merged = mergeSettingsForLocations(remote.length ? remote : local, locationIds)
      setSettings(merged)
      setActiveLocationId(prev => (
        prev && locationIds.includes(prev) ? prev : locationIds[0] || ''
      ))
    }

    load()
    return () => { cancelled = true }
  }, [userId, locationIds])

  const activeLocation = locations.find(loc => loc.id === activeLocationId) || locations[0]
  const activeSetting = getSettingsForLocation(settings, activeLocation?.id || '')

  const updateLocationSetting = (workplaceId, updater) => {
    setSettings(prev => prev.map(setting => (
      setting.workplace_id === workplaceId ? updater(setting) : setting
    )))
  }

  const handleDayChange = (dayKey, patch) => {
    if (!activeLocationId) return
    const { settings: resolved, cleared } = applyDayHoursWithOverlapResolution(
      settings,
      activeLocationId,
      dayKey,
      patch,
    )
    setSettings(resolved)
    if (cleared.length) {
      const dayLabel = WEEKDAYS.find(d => d.key === dayKey)?.label || dayKey
      const clearedNames = [...new Set(cleared.map(c => locationNameById[c.workplace_id]))]
        .filter(Boolean)
        .join(', ')
      setOverlapNote(
        `${dayLabel} updated here — overlapping hours at ${clearedNames} were turned off.`,
      )
    } else {
      setOverlapNote('')
    }
  }

  const handleServiceToggle = (serviceId, checked) => {
    if (!activeLocationId) return
    updateLocationSetting(activeLocationId, setting => ({
      ...setting,
      service_ids: checked
        ? [...new Set([...setting.service_ids, serviceId])]
        : setting.service_ids.filter(id => id !== serviceId),
    }))
    setOverlapNote('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      updateClinicianWorkplaceSettings(userId, settings, locationIds)
      if (isSupabaseConfigured()) {
        await saveAvailabilitySettings(settings)
      }
      setOverlapNote('')
      toast.saved()
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!locations.length) {
    return <p className="text-muted section-card__empty">No locations to configure yet.</p>
  }

  return (
    <form className="profile-availability" onSubmit={handleSave}>
      <div className="profile-availability__toolbar">
        <label className="profile-availability__location-picker">
          <span className="profile-availability__section-label">Location</span>
          <select
            className="paper-input"
            value={activeLocationId}
            onChange={e => {
              setActiveLocationId(e.target.value)
              setOverlapNote('')
            }}
            aria-label="Choose location to edit"
          >
            {locations.map(location => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>
        {activeLocation?.role && (
          <p className="text-small text-muted profile-availability__location-role">
            {formatMemberRole(activeLocation.role)}
          </p>
        )}
      </div>

      {activeSetting && (
        <LocationAvailabilityEditor
          key={activeLocationId}
          setting={activeSetting}
          services={services}
          onDayChange={handleDayChange}
          onServiceToggle={handleServiceToggle}
        />
      )}

      {overlapNote && (
        <p className="text-small text-muted profile-availability__overlap-note" role="status">
          {overlapNote}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save availability'}
        </button>
      </div>
    </form>
  )
}
