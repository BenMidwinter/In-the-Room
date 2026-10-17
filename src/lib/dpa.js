export const DPA_VERSION = '1.1'
export const DPA_PATH = '/legal/dpa'

/** True when this account's latest acceptance is the current agreement. */
export function hasCurrentDpa(profile, acceptances = []) {
  if (profile?.dpa_version === DPA_VERSION) return true
  return acceptances.some((row) => row?.dpa_version === DPA_VERSION)
}
