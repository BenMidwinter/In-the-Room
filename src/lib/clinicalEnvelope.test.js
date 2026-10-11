import { describe, expect, it } from 'vitest'
import { importDek, isEnvelopePayload, openJson, sealJson } from '../../supabase/functions/_shared/envelope.ts'
import { isEnvelopeFormat } from './supabase/clinicalEnvelope'

describe('clinical envelope', () => {
  it('round-trips a note without putting the key in the payload', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const key = await importDek(raw)
    const note = { v: 0, title: 'Session', content: '<p>Kept</p>' }
    const sealed = await sealJson(key, note)
    expect(sealed.alg).toBe('AES-256-GCM')
    expect(JSON.stringify(sealed)).not.toContain('Kept')
    expect(isEnvelopePayload(sealed)).toBe(true)
    await expect(openJson(key, sealed)).resolves.toEqual(note)
  })

  it('treats only the envelope flag as sealed', () => {
    expect(isEnvelopeFormat('envelope')).toBe(true)
    expect(isEnvelopeFormat('plain')).toBe(false)
    expect(isEnvelopeFormat(null)).toBe(false)
  })
})
