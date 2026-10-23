const VIEWPORT_MARGIN = 8
const FONT_MENU_WIDTH = 248

/**
 * Park line for the formatting bar: the bottom of sticky chrome that
 * already sits above the editor (phone bar, section nav, note header).
 * The bar sticks here and cannot rise above its own place in the page.
 */
export function stuckChromeBottom(toolbar) {
  const root = toolbar.closest('.app-shell') || document
  const nodes = root.querySelectorAll(
    '.top-nav__mobile-bar, .client-nav-bar, .room-sticky-bar, .progress-notes-page__header',
  )
  let bottom = 0
  for (const node of nodes) {
    if (node === toolbar || toolbar.contains(node)) continue
    const order = node.compareDocumentPosition(toolbar)
    if ((order & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue
    const style = getComputedStyle(node)
    if (style.display === 'none') continue
    if (style.position !== 'sticky' && style.position !== 'fixed') continue
    if (style.visibility === 'hidden') continue
    const top = Number.parseFloat(style.top)
    const topPx = Number.isFinite(top) ? top : 0
    bottom = Math.max(bottom, topPx + node.getBoundingClientRect().height)
  }
  return bottom
}

/**
 * Sticky offset for the formatting bar. A larger visual-viewport offset
 * (the keyboard has panned the page) parks the bar at the top of the screen
 * you can see. The bar stays sticky, so it cannot leave its place in the
 * page. While the session header is still visible, the stick line stays at
 * or below that header: scrolling back up with the keyboard open settles
 * the bar under the header instead of covering it.
 */
export function formattingBarStickTop(toolbar) {
  const chrome = stuckChromeBottom(toolbar)
  const viewport = window.visualViewport
  const visibleTop = viewport ? viewport.offsetTop : 0
  let top = Math.max(chrome, visibleTop)
  const page = toolbar.closest('.progress-notes-page')
  const header = page?.querySelector('.room-sticky-bar')
  if (!header || header === toolbar || toolbar.contains(header)) return top
  const rect = header.getBoundingClientRect()
  const visibleHeight = viewport ? viewport.height : window.innerHeight
  if (rect.bottom > 0 && rect.top < visibleHeight) {
    top = Math.max(top, rect.bottom + visibleTop)
  }
  return top
}

export function placeEditorPopup(anchor, host) {
  const anchorRect = anchor.getBoundingClientRect()
  const panel = host.firstElementChild
  const wide = anchor.classList.contains('doc-editor__menu--signature')
  const palette = panel?.classList.contains('doc-editor__palette')
  const maxWidth = wide
    ? Math.min(448, window.innerWidth - VIEWPORT_MARGIN * 2)
    : palette
      ? Math.min(FONT_MENU_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
      : Math.min(360, window.innerWidth - VIEWPORT_MARGIN * 2)
  host.classList.toggle('doc-editor__popup-host--card', Boolean(palette))
  host.style.position = 'fixed'
  host.style.zIndex = '80'
  host.style.right = 'auto'
  host.style.maxWidth = `${maxWidth}px`
  host.style.width = (wide || palette) ? `${maxWidth}px` : 'max-content'
  const width = Math.min(host.offsetWidth || maxWidth, maxWidth)
  let left = wide ? anchorRect.right - width : anchorRect.left
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - VIEWPORT_MARGIN - width))
  const top = anchorRect.bottom + 4
  const spaceBelow = Math.max(160, window.innerHeight - top - VIEWPORT_MARGIN)
  host.style.left = `${left}px`
  host.style.top = `${top}px`
  if (panel && palette) {
    panel.style.boxSizing = 'border-box'
    panel.style.width = '100%'
    panel.style.maxHeight = `${spaceBelow}px`
    panel.style.overflowX = 'hidden'
    panel.style.overflowY = 'auto'
    panel.style.overscrollBehavior = 'contain'
  }
}

export function isEditorPopupEvent(event) {
  const target = event.target
  return target instanceof Element && Boolean(target.closest('[data-editor-popup]'))
}
