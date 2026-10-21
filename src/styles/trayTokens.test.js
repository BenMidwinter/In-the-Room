import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const tray = readFileSync(new URL('./tray.css', import.meta.url), 'utf8')
const index = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../components/AppLayout.jsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../features/client/DocumentWorkspace.jsx', import.meta.url), 'utf8')

describe('hardware inset tray tokens', () => {
  it('keeps the legacy radius and paper elevation scale', () => {
    expect(tokens).toMatch(/--radius-sm:\s*6px;/)
    expect(tokens).toMatch(/--radius-md:\s*8px;/)
    expect(tokens).toMatch(/--radius-lg:\s*12px;/)
    expect(tokens).toMatch(/--elevation-paper-1:\s*0 1px 3px/)
  })

  it('defines the concentric surface scale from the token-faithful mock', () => {
    expect(tokens).toMatch(/--radius-bezel:\s*20px;/)
    expect(tokens).toMatch(/--radius-tray:\s*12px;/)
    expect(tokens).toMatch(/--radius-inset:\s*8px;/)
    expect(tokens).toMatch(/--pad-bezel:\s*8px;/)
    expect(tokens).toMatch(/--pad-tray:\s*12px;/)
    expect(tokens).toMatch(/--space-tray-nest:\s*4px;/)
    for (const name of [
      '--surface-base',
      '--surface-bezel',
      '--surface-tray',
      '--surface-inset',
      '--surface-raised',
      '--edge-hairline',
      '--edge-milled',
      '--edge-recessed',
    ]) {
      expect(tokens).toContain(name)
    }
  })

  it('gives high contrast solid edges instead of tone-on-tone hairlines', () => {
    const block = tokens.slice(tokens.lastIndexOf("[data-theme='reading-contrast']"))
    expect(block).toContain('--edge-hairline: #000000;')
    expect(block).toContain('--surface-base: #ffffff;')
  })

  it('exposes tray utilities', () => {
    expect(index).toContain('./styles/tray.css')
    for (const name of ['edge-hairline', 'edge-milled', 'edge-recessed', 'tray-panel', 'tray-inset', 'island-pill', 'divider-indented', 'radius-concentric']) {
      expect(tray).toContain(`@utility ${name}`)
    }
  })

  it('seats the signed-in shell in a bezel and a viewport tray', () => {
    expect(layout).toContain('data-chrome="tray"')
    expect(layout).toContain('app-bezel')
    expect(layout).toContain('viewport-tray')
    expect(tray).toContain('.app-bezel')
    expect(tray).toContain('.viewport-tray')
    expect(tray).toContain('.page-header::before')
    expect(workspace).toContain("querySelector('.viewport-tray')")
  })

  it('turns section cards and record tables into recessed trays', () => {
    expect(tray).toContain('.app-shell--tray .section-card__body')
    expect(tray).toContain('.app-shell--tray .home-stat-card')
    expect(tray).toContain('.app-shell--tray .record-table-wrap')
    expect(tray).toContain('border-bottom-color: var(--edge-hairline)')
  })
})
