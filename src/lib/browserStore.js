import { useCallback, useSyncExternalStore } from 'react'

/**
 * Browser preferences for this device.
 * Add a new preference by reading and writing another key.
 * Values must be plain data IndexedDB can store.
 */
const DB_NAME = 'process-note'
const DB_VERSION = 1
const STORE = 'prefs'

const cache = new Map()
const listeners = new Set()
let dbPromise = null
let hydratePromise = null

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeBrowserStore(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readPref(key) {
  return cache.has(key) ? cache.get(key) : undefined
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  }
  return dbPromise
}

function idbSet(key, value) {
  openDb().then((db) => {
    if (!db) return
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
  }).catch(() => {})
}

function idbGetAll() {
  return openDb().then((db) => {
    if (!db) return []
    return new Promise((resolve) => {
      const rows = []
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(rows)
          return
        }
        rows.push([String(cursor.key), cursor.value])
        cursor.continue()
      }
      request.onerror = () => resolve(rows)
    })
  }).catch(() => [])
}

/** Copy preferences that used to live in localStorage, once, into this store. */
function legacyEntries() {
  const entries = []
  if (typeof localStorage === 'undefined') return entries
  try {
    const startHour = localStorage.getItem('in-the-room-calendar-start-hour')
    const endHour = localStorage.getItem('in-the-room-calendar-end-hour')
    const intervalMinutes = localStorage.getItem('in-the-room-calendar-interval')
    if (startHour != null || endHour != null || intervalMinutes != null) {
      entries.push(['calendar.hours', { startHour, endHour, intervalMinutes }])
    }
    const availSync = localStorage.getItem('in-the-room-calendar-avail-sync')
    if (availSync) entries.push(['calendar.availSync', availSync])
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith('reporting-saved-filters:')) continue
      const parsed = JSON.parse(localStorage.getItem(key) || '[]')
      if (!Array.isArray(parsed)) continue
      entries.push([`reporting.saved.${key.slice('reporting-saved-filters:'.length)}`, parsed])
    }
  } catch {
    /* ignore a blocked or corrupt store */
  }
  return entries
}

export function hydrateBrowserStore() {
  if (!hydratePromise) {
    hydratePromise = idbGetAll().then((rows) => {
      const present = new Set(rows.map(([key]) => key))
      for (const [key, value] of legacyEntries()) {
        if (present.has(key) || cache.has(key)) continue
        rows.push([key, value])
        idbSet(key, value)
      }
      let changed = false
      for (const [key, value] of rows) {
        if (cache.has(key)) continue
        cache.set(key, value)
        changed = true
      }
      if (changed) emit()
    })
  }
  return hydratePromise
}

export function writePref(key, value) {
  if (!key) return
  cache.set(key, value)
  emit()
  idbSet(key, value)
}

export function useBrowserPref(key, fallback) {
  const stored = useSyncExternalStore(
    subscribeBrowserStore,
    () => (key && cache.has(key) ? cache.get(key) : undefined),
    () => undefined,
  )
  const setValue = useCallback((next) => {
    if (!key) return
    const current = cache.has(key) ? cache.get(key) : fallback
    writePref(key, typeof next === 'function' ? next(current) : next)
  }, [key, fallback])
  return [stored === undefined ? fallback : stored, setValue]
}

export function resetBrowserStoreForTests() {
  cache.clear()
  dbPromise = null
  hydratePromise = null
  emit()
}
