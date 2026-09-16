import { api } from './api'

export type ThemePreset = {
  name: string
  label: string
  scheme: 'dark' | 'light'
  accent: string
  accentHover: string
  accentFg: string
  // Optional surface override; presets without it share the Fluent dark/light surfaces
  surfaces?: Partial<Record<'bg' | 's1' | 's2' | 's3' | 'border' | 'text' | 'muted', string>>
}

const darkSurfaces = { bg: '#0b0d10', s1: '#14171c', s2: '#1b1f26', s3: '#242932', border: 'rgba(255,255,255,0.08)', text: '#f3f4f6', muted: '#a3a9b5' }
const lightSurfaces = { bg: '#f3f3f3', s1: '#ffffff', s2: '#f7f7f9', s3: '#ebedf1', border: 'rgba(0,0,0,0.08)', text: '#111318', muted: '#5b6270', accentFg: '#ffffff' }

export const THEMES: ThemePreset[] = [
  { name: 'dark', label: 'Xbox Dark', scheme: 'dark', accent: '#107c10', accentHover: '#16a316', accentFg: '#ffffff' },
  { name: 'fluent-blue', label: 'Fluent Blue', scheme: 'dark', accent: '#4cc2ff', accentHover: '#6fd0ff', accentFg: '#001a2b' },
  { name: 'light', label: 'Light', scheme: 'light', accent: '#0f6cbd', accentHover: '#115ea3', accentFg: '#ffffff', surfaces: lightSurfaces },
  { name: 'neon-blue', label: 'Neon Blue', scheme: 'dark', accent: '#39a7ff', accentHover: '#7cc8ff', accentFg: '#03111f' },
  { name: 'neon-red', label: 'Neon Red', scheme: 'dark', accent: '#ff4d6d', accentHover: '#ff7a8e', accentFg: '#1f0308' },
  { name: 'neon-green', label: 'Neon Green', scheme: 'dark', accent: '#2bff88', accentHover: '#6affb2', accentFg: '#03200f' },
  { name: 'orange-sunrise', label: 'Orange Sunrise', scheme: 'dark', accent: '#ff8a00', accentHover: '#ffa640', accentFg: '#1f0f00' },
  { name: 'purple-galaxy', label: 'Purple Galaxy', scheme: 'dark', accent: '#8b5cf6', accentHover: '#a78bfa', accentFg: '#ffffff' },
  { name: 'sea-breeze', label: 'Sea Breeze', scheme: 'dark', accent: '#00d5ff', accentHover: '#6ee7ff', accentFg: '#00202a' }
]

export function themeByName(name?: string) {
  return THEMES.find((t) => t.name === name) || THEMES[0]
}

export function applyTheme(name: string, opts: { mica?: boolean; platform?: string } = {}) {
  const t = themeByName(name)
  const s = { ...(t.scheme === 'light' ? lightSurfaces : darkSurfaces), ...(t.surfaces || {}) }
  const root = document.documentElement
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set('--bg', s.bg)
  set('--surface-1', s.s1)
  set('--surface-2', s.s2)
  set('--surface-3', s.s3)
  set('--border', s.border)
  set('--text', s.text)
  set('--text-muted', s.muted)
  set('--accent', t.accent)
  set('--accent-hover', t.accentHover)
  set('--accent-fg', t.accentFg)
  set('--accent-glow', hexToRgba(t.accent, 0.35))
  set('--accent-soft', hexToRgba(t.accent, 0.16))
  set('color-scheme', t.scheme)
  root.dataset.scheme = t.scheme
  root.dataset.mica = opts.mica ? '1' : '0'
  if (opts.platform === 'win32') {
    void api.setTitleBarOverlay({ color: opts.mica ? '#00000000' : s.bg, symbolColor: s.text })
  }
}

export function hexToRgba(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}
