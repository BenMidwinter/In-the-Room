/**
 * Public store facade (barrel).
 *
 * The store used to be one ~1000-line file mixing persistence, business rules,
 * and validation. It is now split into a thin data-access layer
 * (`./data/collections`) and cohesive domain modules (`./store/*`). This barrel
 * preserves the original import surface — every consumer still does
 * `import { ... } from '../lib/store'` unchanged — while the internals are
 * modular and backend-swappable.
 */

export * from './store/clientRecords'
export * from './store/clinicalDocs'
export * from './store/scheduling'
export * from './store/organisation'
export * from './store/templates'
export * from './store/journal'

import { resetDb } from './data/collections'

/** Restore all collections to their seed state (used by demo tooling/tests). */
export function resetStore() {
  resetDb()
}
