import type { AudioProfile } from './types'

type Kind = 'launch' | 'open' | 'close' | 'hover' | 'welcome'

const files: Record<AudioProfile, Record<Kind, string>> = {
  normal: {
    launch: new URL('../../../assets/sounds/launch.ogg', import.meta.url).href,
    open: new URL('../../../assets/sounds/open.ogg', import.meta.url).href,
    close: new URL('../../../assets/sounds/close.ogg', import.meta.url).href,
    hover: new URL('../../../assets/sounds/hover.ogg', import.meta.url).href,
    welcome: new URL('../../../assets/sounds/welcome.ogg', import.meta.url).href
  },
  alt: {
    launch: new URL('../../../assets/sounds/launch_alt.ogg', import.meta.url).href,
    open: new URL('../../../assets/sounds/open_alt.ogg', import.meta.url).href,
    close: new URL('../../../assets/sounds/close_alt.ogg', import.meta.url).href,
    hover: new URL('../../../assets/sounds/hover_alt.ogg', import.meta.url).href,
    welcome: new URL('../../../assets/sounds/welcome.ogg', import.meta.url).href
  }
}

const state = { enabled: true, volume: 1, profile: 'normal' as AudioProfile }
let lastHoverAt = 0

export function configureAudio(next: Partial<typeof state>) {
  Object.assign(state, next)
}

export function playSound(kind: Kind) {
  if (!state.enabled) return
  if (kind === 'hover') {
    const now = performance.now()
    if (now - lastHoverAt < 70) return
    lastHoverAt = now
  }
  try {
    const src = files[state.profile]?.[kind] || files.normal[kind]
    const a = new Audio(src)
    a.volume = (kind === 'hover' ? 0.35 : 0.6) * Math.max(0, Math.min(1, state.volume))
    a.play().catch(() => {})
  } catch {}
}
