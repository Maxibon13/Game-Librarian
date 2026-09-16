import type { Game, Settings, WindowChrome } from './types'

type Unsub = () => void

// Thin typed facade over the preload bridge. Every call is optional-safe so the
// renderer still runs in a plain browser (vite dev without electron).
const raw = () => (window as any).electronAPI || {}

async function invoke<T>(name: string, ...args: any[]): Promise<T | undefined> {
  const fn = raw()[name]
  if (typeof fn !== 'function') return undefined
  try { return await fn(...args) } catch { return undefined }
}

function on(name: string, handler: (...a: any[]) => void): Unsub {
  const fn = raw()[name]
  if (typeof fn !== 'function') return () => {}
  try { fn(handler) } catch {}
  return () => {}
}

export const api = {
  listGames: () => invoke<Game[]>('listGames'),
  rescanGames: () => invoke<Game[]>('rescanGames'),
  launchGame: (g: Game) => invoke<boolean>('launchGame', g),
  forceQuit: (g: Game) => invoke<boolean>('forceQuit', g),
  setCustomTitle: (launcher: string, id: string, title: string) => invoke<boolean>('setCustomTitle', launcher, id, title),
  getActiveSessions: () => invoke<{ key: string; startedAt: number; game: Game | null }[]>('getActiveSessions'),
  getSettings: () => invoke<Settings>('getSettings'),
  saveSettings: (s: Settings) => invoke<{ ok: boolean }>('saveSettings', s),
  resetAllPlaytime: () => invoke<boolean>('resetAllPlaytime'),
  revealPath: (p: string) => invoke<boolean>('revealPath', p),
  pickDirectory: () => invoke<string | null>('pickDirectory'),
  openExternal: (url: string) => invoke<void>('openExternal', url),
  getAppConfig: () => invoke<{ appName: string; appRepository: string; appVersion: string }>('getAppConfig'),
  debugSteam: () => invoke<any>('debugSteam'),
  exportLogsBundle: () => invoke<{ ok: boolean; dir?: string }>('exportLogsBundle'),
  resolveCover: (url: string) => invoke<string>('resolveCover', url),
  clearCoverCache: () => invoke<boolean>('clearCoverCache'),
  createStartShortcut: (g: Game) => invoke<{ ok: boolean; path?: string; error?: string }>('createStartShortcut', g),
  applyHotkeys: () => invoke<boolean>('applyHotkeys'),
  getWindowChrome: () => invoke<WindowChrome>('getWindowChrome'),
  setTitleBarOverlay: (o: { color: string; symbolColor: string }) => invoke<boolean>('setTitleBarOverlay', o),
  toggleFullscreen: (force?: boolean) => invoke<boolean>('toggleFullscreen', force),
  minimizeWindow: () => invoke<boolean>('minimizeWindow'),
  toggleMaximizeWindow: () => invoke<boolean>('toggleMaximizeWindow'),
  closeWindow: () => invoke<boolean>('closeWindow'),
  quitApp: () => invoke<boolean>('quitApp'),

  onSessionStart: (h: (p: { game: Game; startedAt: number }) => void) => on('onSessionStart', h),
  onSessionEnd: (h: (p: { game: Game; durationMs: number }) => void) => on('onSessionEnd', h),
  onGamesUpdated: (h: (games: Game[]) => void) => on('onGamesUpdated', h),
  onGamesRefreshing: (h: (busy: boolean) => void) => on('onGamesRefreshing', h),
  onLaunchRequested: (h: (g: Game) => void) => on('onLaunchRequested', h),
  onFocusSearch: (h: () => void) => on('onFocusSearch', h),
  onWindowState: (h: (s: { fullscreen: boolean; maximized: boolean }) => void) => on('onWindowState', h)
}
