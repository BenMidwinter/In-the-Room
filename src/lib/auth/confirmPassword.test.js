import { describe, expect, it } from 'vitest'
import { confirmCurrentPassword } from './confirmPassword'

describe('confirmCurrentPassword', () => {
  it('asks for a password before contacting sign-in', async () => {
    await expect(confirmCurrentPassword('')).rejects.toThrow('Enter your password.')
  })
})
