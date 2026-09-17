import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../src/renderer/ui/App'
import { Cover } from '../src/renderer/components/Cover'
import '../src/renderer/ui/styles.css'

const w = window as any
let games: any[] = []
let updated = (_games: any[]) => {}
let refreshing = (_busy: boolean) => {}
const settings = {
  steam: { steamPath: '', customLibraries: [] }, epic: { manifestDir: '' },
  gog: { manifestDir: '', customLibraries: [] }, ubisoft: { manifestDir: '', customLibraries: [] },
  theme: { name: 'dark' }, ui: { viewMode: 'grid', sort: 'az', reduceMotion: true }, audio: { enabled: false }, windows: {}
}
w.testRescans = 0
w.electronAPI = {
  getSettings: async () => settings,
  getWindowChrome: async () => ({ platform: 'win32', fullscreen: false }),
  getAppConfig: async () => ({ appVersion: 'test' }),
  listGames: async () => games,
  rescanGames: async () => { w.testRescans++; return games },
  getActiveSessions: async () => [],
  saveSettings: async () => ({ ok: true }),
  resolveCover: async (url: string) => url,
  onGamesUpdated: (handler: typeof updated) => { updated = handler },
  onGamesRefreshing: (handler: typeof refreshing) => { refreshing = handler }
}
w.testGames = (next: any[]) => { games = next; updated(next) }
w.testRefreshing = (busy: boolean) => refreshing(busy)
const root = createRoot(document.getElementById('root')!)
root.render(<App />)
w.testCover = () => root.render(<Cover game={{ id: 'roblox-player', title: 'Roblox', launcher: 'roblox', image: 'data:image/png;base64,broken', icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=' }} eager />)
