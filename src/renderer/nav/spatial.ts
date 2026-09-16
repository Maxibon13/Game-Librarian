export type Dir = 'up' | 'down' | 'left' | 'right'

// Elements opt in with `data-nav`. The topmost visible `[data-nav-root]`
// (last in DOM order) scopes navigation so overlays trap focus.
function isVisible(el: HTMLElement) {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

export function navRoot(): ParentNode {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-root]')).filter(isVisible)
  return roots[roots.length - 1] || document
}

export function focusables(root: ParentNode = navRoot()): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-nav]')).filter(isVisible)
}

export function focusFirst(preferDefault = true): boolean {
  const root = navRoot()
  const items = focusables(root)
  if (items.length === 0) return false
  const def = preferDefault ? items.find((el) => el.hasAttribute('data-nav-default')) : undefined
  focusEl(def || items[0])
  return true
}

export function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true })
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }) } catch {}
}

function overlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

export function moveFocus(dir: Dir): boolean {
  const active = document.activeElement as HTMLElement | null
  const root = navRoot()
  const items = focusables(root)
  if (items.length === 0) return false
  if (!active || !active.hasAttribute('data-nav') || !(root === document || root.contains(active))) {
    return focusFirst()
  }
  const a = active.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of items) {
    if (el === active) continue
    const r = el.getBoundingClientRect()
    let primary = 0
    let secondary = 0
    let lateral = 0
    switch (dir) {
      case 'right':
        primary = r.left - a.right
        if (r.left < a.left + 1) continue
        lateral = overlap(a.top, a.bottom, r.top, r.bottom)
        secondary = Math.abs((r.top + r.height / 2) - (a.top + a.height / 2))
        break
      case 'left':
        primary = a.left - r.right
        if (r.right > a.right - 1) continue
        lateral = overlap(a.top, a.bottom, r.top, r.bottom)
        secondary = Math.abs((r.top + r.height / 2) - (a.top + a.height / 2))
        break
      case 'down':
        primary = r.top - a.bottom
        if (r.top < a.top + 1) continue
        lateral = overlap(a.left, a.right, r.left, r.right)
        secondary = Math.abs((r.left + r.width / 2) - (a.left + a.width / 2))
        break
      case 'up':
        primary = a.top - r.bottom
        if (r.bottom > a.bottom - 1) continue
        lateral = overlap(a.left, a.right, r.left, r.right)
        secondary = Math.abs((r.left + r.width / 2) - (a.left + a.width / 2))
        break
    }
    const score = Math.max(0, primary) + (lateral > 0 ? 0 : 600) + secondary * 1.5
    if (score < bestScore) { bestScore = score; best = el }
  }
  if (!best) return false
  focusEl(best)
  return true
}

export function isTextInput(el: Element | null) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit'].includes(type)
  }
  return (el as HTMLElement).isContentEditable
}
