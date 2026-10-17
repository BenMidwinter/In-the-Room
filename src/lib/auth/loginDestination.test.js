import { describe, expect, it } from 'vitest'
import { loginDestination } from './loginDestination'

describe('loginDestination', () => {
  it('sends a missing or authenticator return path home', () => {
    expect(loginDestination(null)).toBe('/home')
    expect(loginDestination('/settings/2fa')).toBe('/home')
    expect(loginDestination('/settings/2fa?x=1')).toBe('/home')
  })

  it('keeps another in-app return path', () => {
    expect(loginDestination('/clients/abc')).toBe('/clients/abc')
  })
})