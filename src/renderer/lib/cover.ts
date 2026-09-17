import React from 'react'
import { api } from './api'
import type { Game } from './types'

// Cover URL selection: local/launcher-provided image first, Steam CDN for Steam ids.
export function coverSources(game: Game, kind: 'portrait' | 'hero' = 'portrait'): string[] {
  const isSteamId = game.launcher === 'steam' && /^\d+$/.test(String(game.id))
  const base = `https://cdn.akamai.steamstatic.com/steam/apps/${game.id}`
  return Array.from(new Set([
    ...(kind === 'hero' && isSteamId ? [`${base}/library_hero.jpg`] : []),
    game.image, ...(game.images || []),
    ...(isSteamId ? [`${base}/library_600x900.jpg`, `${base}/library_600x900_2x.jpg`, `${base}/header.jpg`, `${base}/capsule_616x353.jpg`] : []),
    game.icon
  ].filter((url): url is string => !!url)))
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
    if (out !== url) resolved.set(url, out)
    return out
  }).finally(() => pending.delete(url))
  pending.set(url, next)
  return next
}

// Let the main process resolve/cache the candidate before rendering it. Otherwise
// an immediate CDN 404 can skip a candidate while its metadata fallback is loading.
export function useCover(src: string | null) {
  const [result, setResult] = React.useState<{ src: string | null; url: string | null }>({ src: null, url: null })
  React.useEffect(() => {
    let alive = true
    if (!src) return
    const cached = resolved.get(src)
    if (cached) setResult({ src, url: cached })
    else resolveCover(src).then((url) => { if (alive) setResult({ src, url }) })
    return () => { alive = false }
  }, [src])
  return result.src === src ? result.url : (src && (resolved.get(src) || (!/^https?:/i.test(src) ? src : null)))
}

// Deterministic placeholder hue so games without art still look distinct.
export function placeholderHue(title: string) {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0
  return h % 360
}
