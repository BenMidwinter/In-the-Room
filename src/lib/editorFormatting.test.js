import { describe, expect, it } from 'vitest'
import { EDITOR_FONTS, WRITING_VOICES, filterSlashCommands, fontCssForId } from './editorFormatting'

describe('editor formatting', () => {
  it('defaults the body face to Karla and offers the basic faces', () => {
    expect(EDITOR_FONTS[0].id).toBe('karla')
    expect(fontCssForId('missing')).toContain('Karla')
    expect(EDITOR_FONTS.map((font) => font.label)).toEqual([
      'Karla',
      'Fraunces',
      'Georgia',
      'Times',
      'Arial',
      'Verdana',
      'Courier',
    ])
  })

  it('keeps dictation and audio out of the slash menu', () => {
    const commands = filterSlashCommands('', 'clinical')
    const ids = commands.map((cmd) => cmd.id)
    expect(ids).not.toContain('audio')
    expect(ids).not.toContain('dictation')
    expect(WRITING_VOICES.map((voice) => voice.id)).toEqual(['voice', 'aside', 'land'])
    expect(ids).toContain('quote')
    expect(ids).toContain('dapnotes')
    expect(filterSlashCommands('', 'basic').some((cmd) => cmd.clinical)).toBe(false)
    expect(filterSlashCommands('client', 'clinical').map((cmd) => cmd.id)).toContain('quote')
  })
})