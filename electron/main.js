import { app, BrowserWindow, ipcMain, shell, nativeImage, dialog, globalShortcut, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRemoteVersion, isUpdateAvailable, versionFromPayload } from './version.js'
import { GameDetectionService } from '../src/main/services/detection/GameDetectionService.js'
import { PlaytimeService } from '../src/main/services/tracking/PlaytimeService.js'
import { SettingsService } from '../src/main/services/settings/SettingsService.js'
import { FastloadService } from '../src/main/services/detection/FastloadService.js'
import { SteamDetector } from '../src/main/services/detection/SteamDetector.js'
import { CoverCache } from './covers.js'
import {
  APP_USER_MODEL_ID, TrayController, createStartMenuShortcut, gameKey, notifySessionEnd,
  parsePlayRequest, registerProtocol, setInGame, supportsMica, updateJumpList
} from './windows.js'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null
let appIcon = null
let appIconPath = null
const detectionService = new GameDetectionService()
let playtimeService = null
let settingsService = null
let fastloadService = null
let coverCache = null
let tray = null
let backendInitialized = false
let lastVersionJsonPath = null
let debugLogBuffer = []
let debugLogMax = 1000
let lastGames = []
let libraryMeta = { firstSeen: {}, createdAt: 0 }
let pendingPlay = null
let quitting = false

const APP_NAME = 'Game Librarian'
const APP_REPOSITORY = 'https://github.com/Maxibon13/Game-Librarian'
const isWin = process.platform === 'win32'

// Single instance: second launches forward argv (jump list / protocol) here.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const req = parsePlayRequest(argv)
    if (req) void playByRequest(req)
    showMainWindow()
  })
}
app.on('open-url', (_e, url) => {
  const req = parsePlayRequest([url])
  if (req) void playByRequest(req)
})
if (isWin) app.setAppUserModelId(APP_USER_MODEL_ID)

function showMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) { void createWindow(); return }
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  } catch {}
}

function sendToRenderer(channel, payload) {
  for (const bw of BrowserWindow.getAllWindows()) {
    try { bw.webContents.send(channel, payload) } catch {}
  }
}

async function playByRequest(req) {
  if (!req) return
  if (!backendInitialized || lastGames.length === 0) { pendingPlay = req; return }
  const game = lastGames.find((g) => String(g.launcher) === String(req.launcher) && String(g.id) === String(req.id))
  if (!game) { console.warn('[Play] no game for request', req); return }
  pendingPlay = null
  sendToRenderer('game:launch-requested', game)
  try { await playtimeService.launchGameAndTrack(game) } catch (e) { console.warn('[Play] launch failed', String(e)) }
}

function libraryMetaPath() {
  return path.join(app.getPath('userData'), 'library-meta.json')
}

async function loadLibraryMeta() {
  try {
    const raw = await fs.readFile(libraryMetaPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.firstSeen === 'object') libraryMeta = { firstSeen: parsed.firstSeen, createdAt: parsed.createdAt || 0 }
  } catch {}
}

// Stamps `addedAt` per game so Home can show a "Recently added" rail.
async function stampAddedAt(games) {
  const now = Date.now()
  const firstRun = !libraryMeta.createdAt
  if (firstRun) libraryMeta.createdAt = now
  let dirty = firstRun
  for (const g of games) {
    const k = gameKey(g)
    if (!libraryMeta.firstSeen[k]) { libraryMeta.firstSeen[k] = now; dirty = true }
  }
  if (dirty) {
    try { await fs.writeFile(libraryMetaPath(), JSON.stringify(libraryMeta), 'utf8') } catch {}
  }
  // Games stamped during the very first scan have no meaningful "added" date.
  return games.map((g) => {
    const ts = libraryMeta.firstSeen[gameKey(g)] || now
    return { ...g, addedAt: ts === libraryMeta.createdAt ? undefined : ts }
  })
}

function decorateGames(games) {
  const customTitles = settingsService?.get()?.customTitles || {}
  return games.map((g) => {
    const k = gameKey(g)
    const custom = customTitles[k]
    const original = g.originalTitle || g.title
    return {
      ...g,
      title: custom || original,
      originalTitle: original,
      playtimeMinutes: playtimeService.getPlaytimeMinutes(g),
      lastPlayedAt: playtimeService.getLastPlayedAt(g)
    }
  })
}

function publishGames(games) {
  lastGames = games
  try { updateJumpList(games) } catch {}
  try { tray?.setRecent(games) } catch {}
  if (pendingPlay) void playByRequest(pendingPlay)
}

// Settings hotkeys use "Ctrl+Shift+K" style; Electron wants accelerators.
function toAccelerator(combo) {
  const parts = String(combo || '').split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const map = { Ctrl: 'CommandOrControl', Control: 'CommandOrControl', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Escape: 'Esc' }
  const out = parts.map((p) => map[p] || (p.length === 1 ? p.toUpperCase() : p))
  const hasKey = out.some((p) => !['CommandOrControl', 'Shift', 'Alt', 'Super'].includes(p))
  return hasKey ? out.join('+') : null
}

function applyGlobalHotkeys() {
  try { globalShortcut.unregisterAll() } catch {}
  const hk = settingsService?.get()?.hotkeys || {}
  const bind = (combo, fn) => {
    const acc = toAccelerator(combo)
    if (!acc) return
    try { globalShortcut.register(acc, fn) } catch (e) { console.warn('[Hotkeys] failed', acc, String(e)) }
  }
  bind(hk.openApp, () => showMainWindow())
  bind(hk.quickSearch, () => { showMainWindow(); sendToRenderer('ui:focus-search', null) })
}

function titleBarOverlayFor(settings) {
  const chrome = settings?.ui?.chrome || {}
  return {
    color: chrome.titleBarColor || '#0b0d10',
    symbolColor: chrome.titleBarSymbolColor || '#ffffff',
    height: 40
  }
}
// Resolve Version.Json depending on dev vs packaged
function getVersionJsonCandidatePaths() {
  const candidates = []
  // __dirname is .../electron in both dev and packaged (inside asar)
  candidates.push(path.join(__dirname, '../Version.Json'))
  // Current working dir (useful in dev shells)
  candidates.push(path.join(process.cwd(), 'Version.Json'))
  // Packaged resources path (defensive; usually the __dirname path above works)
  try {
    const resBase = process.resourcesPath
    if (resBase) {
      // If running unpacked asar, the asar virtual path still resolves via normal joins
      candidates.push(path.join(resBase, 'app.asar', 'Version.Json'))
      candidates.push(path.join(resBase, 'Version.Json'))
    }
  } catch {}
  return candidates
}

async function getLocalVersionDetailed() {
  const candidates = getVersionJsonCandidatePaths()
  try { console.log('[Version] Candidates:', candidates) } catch {}
  for (const p of candidates) {
    try {
      if (p && fsSync.existsSync(p)) {
        const raw = await fs.readFile(p, 'utf8')
        const data = JSON.parse(raw)
        const v = versionFromPayload(data)
        if (v) {
          lastVersionJsonPath = p
          try { console.log('[Version] Using Version.Json at', p, 'version', v) } catch {}
          return { version: String(v), path: p, method: 'file' }
        }
      }
    } catch (e) {
      try { console.warn('[Version] Failed reading candidate', p, String(e)) } catch {}
    }
  }
  let fallback = 0
  try { fallback = Number.parseInt(String(app.getVersion ? app.getVersion() : '0'), 10) || 0 } catch {}
  lastVersionJsonPath = null
  try { console.log('[Version] Falling back to app.getVersion()', fallback) } catch {}
  return { version: fallback, path: null, method: 'app.getVersion' }
}

async function getLocalVersion() {
  const det = await getLocalVersionDetailed()
  return det.version
}

function parseOwnerRepo(repoUrl) {
  try {
    const u = new URL(repoUrl)
    const parts = u.pathname.replace(/^\//, '').split('/')
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] }
  } catch {}
  return { owner: 'Maxibon13', repo: 'Game-Librarian' }
}

// Folder the installer should update: repo root in dev, folder containing Game Librarian.exe when packaged
function installRootDir() {
  return app.isPackaged ? path.dirname(process.resourcesPath) : process.cwd()
}

// Attempt to stop the Vite dev server to clean up the dev console (Windows only)
async function stopDevViteIfRunning() {
  try {
    const isDev = !app.isPackaged
    if (!isDev) return
    if (process.platform !== 'win32') return
    await new Promise((resolve) => {
      const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        // Find PID that owns port 5173 and kill its process tree
        "try { $p = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { taskkill /PID $p /T /F | Out-Null } } catch {}"
      ], { stdio: 'ignore' })
      ps.on('close', () => resolve())
      ps.on('error', () => resolve())
    })
  } catch {}
}

async function checkForUpdate() {
  const local = String(await getLocalVersion() ?? '')
  try {
    const { owner, repo } = parseOwnerRepo(APP_REPOSITORY)
    const remote = await fetchRemoteVersion(owner, repo)
    if (!remote) {
      return { ok: false, error: 'could not read Version.Json from repository', localVersion: local, remoteVersion: '', repository: APP_REPOSITORY, updateAvailable: false }
    }
    const updateAvailable = isUpdateAvailable(local, remote)
    try { console.log('[Updater] versions', { local, remote, updateAvailable }) } catch {}
    return { ok: true, updateAvailable, localVersion: local, remoteVersion: remote, repository: APP_REPOSITORY }
  } catch (e) {
    return { ok: false, error: String(e), localVersion: local, remoteVersion: '', repository: APP_REPOSITORY, updateAvailable: false }
  }
}

async function registerIpcAndServices() {
  if (backendInitialized) return
  playtimeService = new PlaytimeService(app.getPath('userData'))
  settingsService = new SettingsService(app.getPath('userData'))
  fastloadService = new FastloadService(app.getPath('userData'))
  coverCache = new CoverCache(path.join(app.getPath('userData'), 'covers'))
  await settingsService.load()
  await coverCache.init()
  await loadLibraryMeta()
  applyGlobalHotkeys()

  // Taskbar / toast integration driven by playtime sessions
  playtimeService.hooks = {
    onSessionStart: ({ game }) => {
      setInGame(mainWindow, game, { icon: appIcon, onForceQuit: (g) => { try { playtimeService.forceQuit(g) } catch {} } })
    },
    onSessionEnd: ({ game, durationMs }) => {
      setInGame(mainWindow, null)
      const notify = settingsService.get()?.windows?.notifications !== false
      if (notify && durationMs > 0) notifySessionEnd(game, durationMs, { icon: appIcon, onClick: showMainWindow })
      // Refresh recents in jump list / tray
      publishGames(decorateGames(lastGames))
      sendToRenderer('games:updated', lastGames)
    }
  }

  if (isWin && !tray) {
    tray = new TrayController({
      icon: appIcon,
      onShow: showMainWindow,
      onPlay: (g) => playByRequest({ launcher: g.launcher, id: g.id }),
      onQuit: () => { quitting = true; app.quit() }
    })
    tray.create()
  }

  // Install debug console forwarder once
  try {
    if (!console.__glWrapped) {
      const orig = { log: console.log, warn: console.warn, error: console.error }
      const push = (level, args) => {
        try {
          const ts = new Date().toISOString()
          const text = args.map((a) => {
            if (typeof a === 'string') return a
            try { return JSON.stringify(a) } catch { return String(a) }
          }).join(' ')
          const line = { ts, level, text }
          debugLogBuffer.push(line)
          if (debugLogBuffer.length > debugLogMax) debugLogBuffer.splice(0, debugLogBuffer.length - debugLogMax)
          for (const bw of BrowserWindow.getAllWindows()) {
            try { bw.webContents.send('debug:log', line) } catch {}
          }
        } catch {}
      }
      console.log = (...args) => { try { orig.log.apply(console, args) } catch {}; push('log', args) }
      console.warn = (...args) => { try { orig.warn.apply(console, args) } catch {}; push('warn', args) }
      console.error = (...args) => { try { orig.error.apply(console, args) } catch {}; push('error', args) }
      Object.defineProperty(console, '__glWrapped', { value: true, enumerable: false })
    }
  } catch {}

  ipcMain.handle('games:list', async () => {
    console.log('[Fastload] games:list called')
    // First try to load from fastload cache
    let games = await fastloadService.loadGames()
    
    if (games.length === 0) {
      // No cache available, do full detection
      console.log('[Fastload] No cache available, performing full detection')
      games = await detectionService.detectAll(settingsService.get())
      // Save to cache for next time
      await fastloadService.saveGames(games)
    } else {
      // Cache loaded, update in background
      console.log('[Fastload] Cache loaded, updating in background')
      sendToRenderer('games:refreshing', true)
      setImmediate(async () => {
        try {
          const freshGames = await detectionService.detectAll(settingsService.get())
          await fastloadService.saveGames(freshGames)
          console.log('[Fastload] Background update completed')
          const decorated = decorateGames(await stampAddedAt(freshGames))
          publishGames(decorated)
          sendToRenderer('games:updated', decorated)
        } catch (error) {
          console.warn('[Fastload] Background update failed:', error.message)
        } finally {
          sendToRenderer('games:refreshing', false)
        }
      })
    }

    console.log(`[Fastload] Returning ${games.length} games`)
    const decorated = decorateGames(await stampAddedAt(games))
    publishGames(decorated)
    return decorated
  })

  ipcMain.handle('games:rescan', async () => {
    sendToRenderer('games:refreshing', true)
    try {
      const fresh = await detectionService.detectAll(settingsService.get())
      await fastloadService.saveGames(fresh)
      const decorated = decorateGames(await stampAddedAt(fresh))
      publishGames(decorated)
      return decorated
    } finally {
      sendToRenderer('games:refreshing', false)
    }
  })

  ipcMain.handle('games:setCustomTitle', async (_e, { launcher, id, title }) => {
    const current = settingsService.get()
    const customTitles = { ...(current.customTitles || {}) }
    const k = `${launcher}:${id}`
    const next = String(title || '').trim()
    if (next) customTitles[k] = next
    else delete customTitles[k]
    await settingsService.save({ ...current, customTitles })
    lastGames = decorateGames(lastGames)
    publishGames(lastGames)
    sendToRenderer('games:updated', lastGames)
    return true
  })

  ipcMain.handle('session:active', async () => {
    const active = playtimeService.activeSessions()
    return active.map((s) => ({ ...s, game: lastGames.find((g) => gameKey(g) === s.key) || null }))
  })

  // Cover art: resolve remote URLs to a disk-cached file URL
  ipcMain.handle('covers:resolve', async (_e, url) => {
    try { return await coverCache.resolve(url) } catch { return String(url || '') }
  })
  ipcMain.handle('covers:clear', async () => { try { await coverCache.clear(); return true } catch { return false } })

  // Windows shell integrations
  ipcMain.handle('shell:createStartShortcut', async (_e, game) => createStartMenuShortcut(game, { iconPath: appIconPath }))
  ipcMain.handle('hotkeys:apply', async () => { applyGlobalHotkeys(); return true })

  // Window chrome
  ipcMain.handle('window:getChrome', async () => ({
    platform: process.platform,
    mica: isWin && supportsMica() && settingsService.get()?.ui?.mica !== false,
    micaSupported: supportsMica(),
    fullscreen: !!mainWindow?.isFullScreen(),
    maximized: !!mainWindow?.isMaximized(),
    titleBarHeight: 40
  }))
  ipcMain.handle('window:setTitleBarOverlay', async (_e, { color, symbolColor }) => {
    try {
      if (isWin && mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitleBarOverlay({ color, symbolColor, height: 40 })
      const current = settingsService.get()
      await settingsService.save({ ...current, ui: { ...(current.ui || {}), chrome: { titleBarColor: color, titleBarSymbolColor: symbolColor } } })
      return true
    } catch { return false }
  })
  ipcMain.handle('window:toggleFullscreen', async (_e, force) => {
    if (!mainWindow) return false
    const next = typeof force === 'boolean' ? force : !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
  })
  ipcMain.handle('window:minimize', async () => { mainWindow?.minimize(); return true })
  ipcMain.handle('window:toggleMaximize', async () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', async () => { mainWindow?.close(); return true })
  ipcMain.handle('app:quit', async () => { quitting = true; app.quit(); return true })

  ipcMain.handle('game:launch', async (_e, game) => {
    try { console.log('[IPC] game:launch', { launcher: game?.launcher, title: game?.title, id: game?.id, aumid: game?.aumid }) } catch {}
    // Use the unified launcher which also starts process monitoring
    await playtimeService.launchGameAndTrack(game)
    return true
  })

  ipcMain.handle('open:external', async (_e, url) => {
    await shell.openExternal(url)
  })
  ipcMain.handle('devtools:toggle', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() || mainWindow
      if (!win) return false
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
      else win.webContents.openDevTools({ mode: 'detach' })
      return true
    } catch { return false }
  })
  ipcMain.handle('logs:exportBundle', async () => {
    try {
      const isDev = !app.isPackaged
      const base = isDev ? process.cwd() : path.join(process.resourcesPath, '..')
      const logsRoot = path.join(base, 'Logs')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      await fs.mkdir(logsRoot, { recursive: true })
      const outDir = path.join(logsRoot, `bundle-${timestamp}`)
      await fs.mkdir(outDir, { recursive: true })
      const items = []
      // Collect playtime data and settings
      try { items.push({ name: 'playtime.json', src: path.join(app.getPath('userData'), 'playtime.json') }) } catch {}
      try { items.push({ name: 'settings.json', src: path.join(app.getPath('userData'), 'settings.json') }) } catch {}
      // Collect recent renderer console if available via a dump file (optional future integration)
      // Copy files best-effort
      for (const it of items) {
        try {
          if (fsSync.existsSync(it.src)) {
            const dest = path.join(outDir, it.name)
            await fs.copyFile(it.src, dest)
          }
        } catch {}
      }
      // Write an info stub
      try {
        const info = {
          createdAt: new Date().toISOString(),
          appVersion: await getLocalVersion(),
          os: process.platform,
        }
        await fs.writeFile(path.join(outDir, 'bundle.json'), JSON.stringify(info, null, 2), 'utf8')
      } catch {}
      return { ok: true, dir: outDir }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  ipcMain.handle('os:openPath', async (_e, p) => {
    try {
      const input = String(p || '').trim()
      if (!input) return false
      const normalized = path.resolve(input)
      try {
        const stats = await fs.stat(normalized)
        if (stats.isDirectory()) {
          await shell.openPath(normalized)
          return true
        }
        // File: reveal in folder
        try { shell.showItemInFolder(normalized) } catch {}
        return true
      } catch {
        // If path doesn't exist, try opening parent directory when sensible
        const parent = path.dirname(normalized)
        if (parent && parent !== normalized && fsSync.existsSync(parent)) {
          await shell.openPath(parent)
          return true
        }
        return false
      }
    } catch {
      return false
    }
  })

  ipcMain.handle('os:revealPath', async (_e, p) => {
    try {
      const input = String(p || '').trim()
      try { console.log('[RevealPath] input:', input) } catch {}
      if (!input) return false
      // Strip quotes and convert file URLs
      let cleaned = input.replace(/^"|"$/g, '')
      if (/^file:\/\//i.test(cleaned)) {
        try {
          const u = new URL(cleaned)
          cleaned = u.pathname
          if (process.platform === 'win32' && cleaned.startsWith('/')) cleaned = cleaned.slice(1)
          cleaned = decodeURIComponent(cleaned)
        } catch {}
      }
      const normalized = path.resolve(cleaned)
      try { console.log('[RevealPath] normalized:', normalized) } catch {}
      try {
        const stats = await fs.stat(normalized)
        if (stats.isDirectory()) {
          try { console.log('[RevealPath] open directory') } catch {}
          await shell.openPath(normalized)
          return true
        }
        try { console.log('[RevealPath] reveal file in folder') } catch {}
        shell.showItemInFolder(normalized)
        return true
      } catch {
        const parent = path.dirname(normalized)
        if (parent && parent !== normalized && fsSync.existsSync(parent)) {
          try { console.log('[RevealPath] fallback to parent dir:', parent) } catch {}
          await shell.openPath(parent)
          return true
        }
        try { console.warn('[RevealPath] path not found:', normalized) } catch {}
        return false
      }
    } catch { return false }
  })

  ipcMain.handle('steam:revealGameFolder', async (_e, { libraryDir, title }) => {
    try {
      const lib = String(libraryDir || '').trim()
      const game = String(title || '').trim()
      if (!lib || !game) return false
      const commonDir = path.join(lib, 'steamapps', 'common')
      try {
        const entries = await fs.readdir(commonDir)
        // find best match (case-insensitive contains)
        const lower = game.toLowerCase()
        let match = entries.find((n) => n.toLowerCase() === lower)
        if (!match) match = entries.find((n) => n.toLowerCase().includes(lower))
        if (!match) return false
        const target = path.join(commonDir, match)
        try { console.log('[SteamReveal] target:', target) } catch {}
        await shell.openPath(target)
        return true
      } catch { return false }
    } catch { return false }
  })

  ipcMain.handle('dialog:pickDirectory', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() || mainWindow
      const res = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Select folder',
        properties: ['openDirectory', 'dontAddToRecent']
      })
      if (res.canceled || !res.filePaths?.length) return null
      return res.filePaths[0]
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:get', async () => settingsService.get())
  ipcMain.handle('settings:save', async (_e, next) => {
    const current = settingsService.get()
    await settingsService.save(next)
    if (JSON.stringify(current?.hotkeys) !== JSON.stringify(next?.hotkeys)) applyGlobalHotkeys()
    
    // Only clear fastload cache when game detection related settings change
    const shouldClearCache = 
      JSON.stringify(current?.steam) !== JSON.stringify(next?.steam) ||
      JSON.stringify(current?.epic) !== JSON.stringify(next?.epic) ||
      JSON.stringify(current?.gog) !== JSON.stringify(next?.gog) ||
      JSON.stringify(current?.ubisoft) !== JSON.stringify(next?.ubisoft) ||
      JSON.stringify(current?.xbox) !== JSON.stringify(next?.xbox)
    
    if (shouldClearCache && fastloadService) {
      console.log('[Fastload] Game detection settings changed, clearing cache')
      await fastloadService.clearCache()
    }
    
    return { ok: true }
  })

  ipcMain.handle('playtime:resetAll', async () => {
    try { playtimeService.resetAllPlaytime() } catch {}
    return true
  })

  ipcMain.handle('game:forceQuit', async (_e, game) => {
    try { playtimeService.forceQuit(game) } catch {}
    return true
  })

  // Temporarily disabled controller detection IPC until tests are finalized
  ipcMain.handle('controller:detect', async () => ({ ok: false, connected: false }))

  // Debug console IPC
  ipcMain.handle('debug:getBuffer', async () => {
    try { return { ok: true, lines: debugLogBuffer } } catch { return { ok: false, lines: [] } }
  })
  ipcMain.handle('debug:clear', async () => {
    try {
      debugLogBuffer = []
      for (const bw of BrowserWindow.getAllWindows()) {
        try { bw.webContents.send('debug:cleared') } catch {}
      }
      return true
    } catch { return false }
  })

  ipcMain.handle('debug:steam', async () => {
    const steam = detectionService.detectors.find((d) => d.type === 'steam')
    return steam && steam.lastDebug ? steam.lastDebug : null
  })
  backendInitialized = true
}

async function createWindow() {
  if (!appIcon) {
    try {
      // Resolve icon for both dev and packaged
      const rel = path.join('assets', 'icons', 'Icon.png')
      const candidates = [path.join(process.cwd(), rel), path.join(__dirname, '..', rel), path.join(process.resourcesPath || '', rel)]
      for (const p of candidates) {
        if (p && fsSync.existsSync(p)) { appIcon = nativeImage.createFromPath(p); appIconPath = p; break }
      }
    } catch {}
  }
  const isDev = !app.isPackaged
  // Settings may not be loaded yet (updater screen runs before backend:init); read the file directly.
  let earlySettings = {}
  try { earlySettings = JSON.parse(fsSync.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')) } catch {}
  const useMica = isWin && supportsMica() && earlySettings?.ui?.mica !== false

  Menu.setApplicationMenu(null)
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: appIcon || undefined,
    backgroundColor: useMica ? '#00000000' : '#0b0d10',
    ...(isWin ? { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlayFor(earlySettings) } : { titleBarStyle: 'hiddenInset' }),
    ...(useMica ? { backgroundMaterial: 'mica' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow loading file:/// images/resources when UI runs from http://localhost in dev
      webSecurity: isDev ? false : true,
      allowRunningInsecureContent: isDev ? true : false
    }
  })
  mainWindow.once('ready-to-show', () => { try { mainWindow.show() } catch {} })
  if (isDev) {
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.log('[Renderer]', message)
    })
  }

  // Menu is removed; keep devtools + fullscreen keys alive.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const ctrlShiftI = input.control && input.shift && String(input.key).toLowerCase() === 'i'
    if (input.key === 'F12' || ctrlShiftI) {
      event.preventDefault()
      if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools()
      else mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })
  const emitWindowState = () => sendToRenderer('window:state', { fullscreen: mainWindow.isFullScreen(), maximized: mainWindow.isMaximized() })
  mainWindow.on('enter-full-screen', emitWindowState)
  mainWindow.on('leave-full-screen', emitWindowState)
  mainWindow.on('maximize', emitWindowState)
  mainWindow.on('unmaximize', emitWindowState)

  // Close to tray (opt-in) so sessions keep tracking with the window hidden
  mainWindow.on('close', (e) => {
    if (quitting) return
    const closeToTray = !!settingsService?.get()?.windows?.closeToTray
    if (isWin && closeToTray && tray?.tray) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  
  if (isDev) {
    const url = 'http://localhost:5173'
    // If Python launcher is managing processes, skip auto-start here
    const managedByPy = process.env.GL_MANAGED_BY_PY === '1'
    if (!managedByPy) {
      try {
        // Spawn Vite with console visibility controlled by settings
        const isWin = process.platform === 'win32'
        if (isWin) {
          // Hidden console for Vite in dev
          spawn('cmd.exe', ['/c', 'start', '/B', 'npm', 'run', 'vite'], {
            cwd: process.cwd(),
            env: { ...process.env },
            detached: false,
            windowsHide: true,
            stdio: 'ignore'
          })
        } else {
          spawn('npm', ['run', 'vite'], { cwd: process.cwd(), env: { ...process.env }, stdio: 'ignore', detached: true })
        }
      } catch {}
    }
    await mainWindow.loadURL(url)
  } else {
    // In production we ship the built UI under app.asar/dist
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  // Expose updater IPC before backend is initialized
  ipcMain.handle('updater:getConfig', async () => ({ appName: APP_NAME, appRepository: APP_REPOSITORY, appVersion: await getLocalVersion(), canUpdate: true }))
  ipcMain.handle('version:debug', async () => {
    const det = await getLocalVersionDetailed()
    return det
  })
  ipcMain.handle('updater:check', async () => checkForUpdate())
  ipcMain.handle('updater:run', async () => {
    try {
      const isDev = !app.isPackaged
      const base = isDev ? process.cwd() : process.resourcesPath
      const scriptPath = path.join(base, 'tools', 'updater.bat')
      const env = { ...process.env }
      // Install root: in dev update in-place, in prod the folder holding Game Librarian.exe (parent of resources)
      env.INSTALL_DIR = installRootDir()
      return await new Promise((resolve) => {
        const p = spawn('cmd.exe', ['/c', scriptPath], { stdio: ['ignore','inherit','inherit'], env })
        p.on('error', () => resolve({ ok: false }))
        p.on('close', (code) => resolve({ ok: code === 0, code }))
      })
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  ipcMain.handle('updater:runWithLogs', async () => {
    try {
      const isDev = !app.isPackaged
      const base = isDev ? process.cwd() : process.resourcesPath
      const scriptPath = path.join(base, 'tools', 'updater.bat')
      const env = { ...process.env }
      env.INSTALL_DIR = installRootDir()
      const p = spawn('cmd.exe', ['/c', scriptPath], { env })
      const forward = (channel, data) => {
        const text = Buffer.isBuffer(data) ? data.toString() : String(data || '')
        try {
          for (const bw of BrowserWindow.getAllWindows()) {
            bw.webContents.send(channel, text)
          }
        } catch {}
      }
      p.stdout.on('data', (d) => forward('updater:log', d))
      p.stderr.on('data', (d) => forward('updater:log', d))
      return await new Promise((resolve) => {
        p.on('error', (e) => {
          forward('updater:log', String(e))
          forward('updater:done', JSON.stringify({ ok: false, code: -1 }))
          resolve({ ok: false })
        })
        p.on('close', (code) => {
          forward('updater:done', JSON.stringify({ ok: code === 0, code }))
          resolve({ ok: code === 0, code })
        })
      })
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  ipcMain.handle('updater:installAndExit', async () => {
    try {
      const isDev = !app.isPackaged
      const base = isDev ? process.cwd() : process.resourcesPath
      const installerDir = path.join(base, 'installer')
      const exeInstaller = path.join(installerDir, 'Installer.exe')
      const pyGui = path.join(installerDir, 'src', 'installer_gui.pyw')
      const env = { ...process.env, GL_LAUNCHED_FROM_APP: '1' }
      env.INSTALL_DIR = installRootDir()
      // Launch via 'start' so the GUI is detached from the Electron process group and
      // survives the app quitting right after spawning.
      const launch = (cwd, ...args) => spawn('cmd.exe', ['/c', 'start', '""', ...args], { cwd, env, detached: true, windowsHide: false, stdio: 'ignore' })
      let child
      if (fsSync.existsSync(exeInstaller)) {
        child = launch(installerDir, 'Installer.exe', '--update')
      } else if (fsSync.existsSync(pyGui)) {
        child = launch(path.dirname(pyGui), 'py', '-3', path.basename(pyGui), '--update')
      } else {
        return { ok: false, error: 'Installer not found at ' + exeInstaller }
      }
      child.unref()
      // In dev, stop Vite to clean up the console instead of quitting the app.
      // In production, quit the app as before.
      if (isDev) {
        await stopDevViteIfRunning()
      } else {
        // Give the spawned process a moment to initialize before quitting
        setTimeout(() => { try { app.quit() } catch {} }, 1000)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  ipcMain.handle('backend:init', async () => { await registerIpcAndServices(); return { ok: true } })
  registerProtocol()
  pendingPlay = parsePlayRequest(process.argv)
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => { quitting = true })
app.on('will-quit', () => {
  try { globalShortcut.unregisterAll() } catch {}
  try { tray?.destroy() } catch {}
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})


