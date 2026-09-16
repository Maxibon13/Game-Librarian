import React from 'react'
import { api } from './api'
import type { Game } from './types'

// Cover URL selection: local/launcher-provided image first, Steam CDN for Steam ids.
export function coverSource(game: Game, kind: 'portrait' | 'hero' = 'portrait'): string | null {
  const isSteamId = game.launcher === 'steam' && /^\d+$/.test(String(game.id))
  if (kind === 'hero' && isSteamId) return `https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_hero.jpg`
  if (game.image) return game.image
  if (isSteamId) return `https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_600x900.jpg`
  return null
}

const resolved = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

export function resolveCover(url: string): Promise<string> {
  if (!/^https?:/i.test(url)) return Promise.resolve(url)
  const hit = resolved.get(url)
  if (hit) return Promise.resolve(hit)
  const p = pending.get(url)
  if (p) return p
  const next = api.resolveCover(url).then((r) => {
    const out = r || url
    resolved.set(url, out)
    return out
  }).finally(() => pending.delete(url))
  pending.set(url, next)
  return next
}

// Returns a disk-cached URL for the cover once available; falls back to the
// remote URL immediately so the image can start loading.
export function useCover(game: Game, kind: 'portrait' | 'hero' = 'portrait') {
  const src = coverSource(game, kind)
  const [url, setUrl] = React.useState<string | null>(() => (src ? resolved.get(src) || src : null))
  React.useEffect(() => {
    let alive = true
    if (!src) { setUrl(null); return }
    const cached = resolved.get(src)
    setUrl(cached || src)
    if (!cached) resolveCover(src).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [src])
  return url
}

// Deterministic placeholder hue so games without art still look distinct.
export function placeholderHue(title: string) {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0
  return h % 360
}
