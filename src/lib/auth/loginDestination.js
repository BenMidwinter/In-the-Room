/** Where to go after sign-in. The authenticator settings page is not a return target. */
export function loginDestination(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return '/home'
  if (next === '/settings/2fa' || next.startsWith('/settings/2fa?') || next.startsWith('/settings/2fa/')) {
    return '/home'
  }
  return next
}
