import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const tray = readFileSync(new URL('./tray.css', import.meta.url), 'utf8')
const index = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../components/AppLayout.jsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../features/client/DocumentWorkspace.jsx', import.meta.url), 'utf8')
const profile = readFileSync(new URL('../features/client/PatientProfile.jsx', import.meta.url), 'utf8')
const notes = readFileSync(new URL('../features/client/ProgressNotesPage.jsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../features/home/HomePage.jsx', import.meta.url), 'utf8')
const tags = readFileSync(new URL('../features/settings/TagsSettingsPage.jsx', import.meta.url), 'utf8')
const overview = readFileSync(new URL('../features/client/ClientPanelEmpty.jsx', import.meta.url), 'utf8')
const profileOverlay = readFileSync(new URL('../features/client/ClientProfileOverlay.jsx', import.meta.url), 'utf8')

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

  it('keeps the signed-in shell flat, without an outer frame or a recessed nav', () => {
    expect(tray).not.toContain('background: var(--surface-bezel)')
    const shell = tray.slice(tray.indexOf('body:has(.app-shell--tray)'), tray.indexOf('.viewport-tray {'))
    expect(shell).toContain('background-color: var(--surface-tray)')
    expect(shell).toContain('padding: 0;')
    expect(shell).toContain('background: var(--surface-tray);')
    expect(shell).toContain('border-right: 1px solid var(--edge-hairline)')
    const links = tray.slice(
      tray.indexOf('.app-shell--tray .top-nav__links {'),
      tray.indexOf('.app-shell--tray .top-nav__link {'),
    )
    expect(links).toContain('background: transparent')
    expect(links).not.toContain('var(--edge-recessed)')
    const viewport = tray.slice(tray.indexOf('.viewport-tray {'), tray.indexOf('.app-shell--tray .page,'))
    expect(viewport).toContain('margin: 0;')
    expect(viewport).toContain('box-shadow: none;')
    expect(viewport).not.toContain('var(--edge-recessed)')
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

  it('keeps the nav, badges, and table frame on the tray scale', () => {
    expect(layout).toContain('tray-utilities')
    expect(layout).toContain('Sign out')
    expect(tray).toContain('.app-shell--tray .top-nav__links')
    expect(tray).toContain('.section-card__body:has(.record-table-wrap)')
    expect(tray).toContain('border-radius: var(--radius-tray)')
    expect(tray).toContain('.app-shell--tray .client-layout')
    expect(tray).toContain('.app-shell--tray :is(.badge, .status-badge, .room-tag, .tag-label)')
    expect(tray).toContain('border-radius: var(--radius-pill)')
    expect(tray).toContain('.app-shell--tray .record-table tbody td')
    expect(tray).toContain('.app-shell--tray .record-table__count')
    expect(tray).toContain('.tray-grid')
    expect(home).toContain('title="Active cases"')
    expect(home).not.toContain('home-caseload')
    expect(tags).toContain('tray-grid')
    expect(tray).toContain('--module-card: 32rem')
    expect(tray).toContain('.app-shell--tray .top-nav__inner')
    expect(tray).toContain('text-align: left')
    expect(tray).toContain('justify-content: flex-start')
    expect(tray).toContain('max-height: 8.5rem')
    const pageSurface = tray.slice(
      tray.indexOf('.app-shell--tray .page,'),
      tray.indexOf('.page-header::before'),
    )
    expect(pageSurface).toContain('background: var(--surface-tray)')
    expect(overview).toContain('client-details__formulation')
    expect(overview).toContain('blockId="client-details"')
    expect(overview).toContain('blockId="client-sessions"')
    expect(overview).toContain('className="tray-grid"')
    expect(profileOverlay).toContain('maxLength: 2000')
    expect(profileOverlay).toContain('maxLength={maxLength}')
    expect(tray).toContain('@media (max-width: 639px)')
    expect(tray).toContain('env(safe-area-inset-top, 0px)')
    expect(tray).toContain('env(safe-area-inset-bottom, 0px)')
    expect(tray).toContain('.calendar-toolbar__cluster')
    expect(tray).toContain('.editor-context-chip')
    const phone = tray.slice(tray.indexOf('@media (max-width: 639px)'))
    expect(phone).toContain('.app-shell--tray .tray-utilities')
    expect(phone).toContain('.top-nav__phone-utilities')
    expect(phone).toContain('.room-sticky-bar__trailing')
    expect(phone).toContain('.calendar-view-options')
    expect(phone).toContain('padding-right: var(--space-inline)')
    expect(phone).toContain('.progress-notes-page__editor > .artwork-zone')
    expect(phone).toContain('.calendar-toolbar__label-short')
    expect(phone).toContain('.client-shell__title-row')
    expect(indexHtml).toContain('viewport-fit=cover')
    expect(phone).toContain('background-color: var(--surface-tray)')
    expect(phone).toContain('.app-shell--tray .client-nav-bar')
    expect(phone).toContain('z-index: 20')
    expect(phone).toContain('overflow: visible')
    expect(phone).toContain('min-height: 100lvh')
    expect(phone).toContain('height: auto')
    expect(phone).not.toContain('padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 0px))')
    expect(phone).not.toContain('-webkit-fill-available')
    expect(phone).not.toContain('100dvh - var(--nav-height)')
    expect(phone).toContain('.client-nav-bar.client-nav-bar--sub')
    const desktopTray = tray.slice(0, tray.indexOf('@media (max-width: 639px)'))
    expect(desktopTray).not.toContain('.app-shell--tray .client-nav-bar')
    expect(desktopTray).not.toContain('100dvh - var(--nav-height)')
    expect(layout).toContain('top-nav__phone-utilities')
    expect(workspace).toContain('!phone && inspectorExtras')
    expect(workspace).toContain('hasHeaderActions')
    expect(profile).toContain('usePhoneLayout')
    expect(profile).toContain('setDetailsOpen')
    expect(notes).toContain('progress-notes-page__banner--sheet')
    expect(notes).toContain('editor-inspector__context')
    expect(notes).toContain('{!phone && (\n            <ArtworkAttachmentZone')
    expect(notes).toContain('<EditorInspector open={inspectorOpen}')
  })
})
