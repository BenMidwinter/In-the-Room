const VIEWPORT_MARGIN = 8

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

export function placeEditorPopup(anchor, host) {
  const anchorRect = anchor.getBoundingClientRect()
  const wide = anchor.classList.contains('doc-editor__menu--signature')
  const maxWidth = wide
    ? Math.min(448, window.innerWidth - VIEWPORT_MARGIN * 2)
    : Math.min(360, window.innerWidth - VIEWPORT_MARGIN * 2)
  host.style.position = 'fixed'
  host.style.zIndex = '80'
  host.style.maxWidth = `${maxWidth}px`
  host.style.width = wide ? `${maxWidth}px` : 'max-content'
  host.style.right = 'auto'
  const width = Math.min(host.offsetWidth || maxWidth, maxWidth)
  let left = wide ? anchorRect.right - width : anchorRect.left
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - VIEWPORT_MARGIN - width))
  const top = anchorRect.bottom + 4
  const spaceBelow = window.innerHeight - top - VIEWPORT_MARGIN
  host.style.left = `${left}px`
  host.style.top = `${top}px`
  host.style.maxHeight = `${Math.max(120, spaceBelow)}px`
}

export function isEditorPopupEvent(event) {
  const target = event.target
  return target instanceof Element && Boolean(target.closest('[data-editor-popup]'))
}
