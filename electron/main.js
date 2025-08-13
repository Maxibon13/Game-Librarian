import { app, BrowserWindow, ipcMain, shell, nativeImage, dialog } from 'electron'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GameDetectionService } from '../src/main/services/detection/GameDetectionService.js'
import { PlaytimeService } from '../src/main/services/tracking/PlaytimeService.js'
import { SettingsService } from '../src/main/services/settings/SettingsService.js'
import { SteamDetector } from '../src/main/services/detection/SteamDetector.js'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null
let appIcon = null
const detectionService = new GameDetectionService()
let playtimeService = null
let settingsService = null
let backendInitialized = false
let lastVersionJsonPath = null
let debugLogBuffer = []
let debugLogMax = 1000

const APP_NAME = 'Game Librarian'
const APP_REPOSITORY = 'https://github.com/Maxibon13/Game-Librarian'
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
        const v = data?.version
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

function compareNumericVersions(local, remote) {
  const li = Number.parseFloat(String(local ?? '0'))
  const ri = Number.parseFloat(String(remote ?? '0'))
  if (Number.isNaN(li) || Number.isNaN(ri)) return 0
  return li - ri
}

async function fetchRemoteVersionStrict(rawUrl) {
  // Try fetch with explicit headers and timeout, then fallback to https module
  const tryFetch = async () => {
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 10000)
      const res = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'GameLibrarian-Updater',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        signal: ac.signal
      })
      clearTimeout(t)
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      const v = String(json?.version ?? '').trim()
      return v || null
    } catch {
      return null
    }
  }
  const viaHttps = async () => {
    return await new Promise((resolve) => {
      try {
        const req = https.get(rawUrl, {
          headers: {
            'User-Agent': 'GameLibrarian-Updater',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }, (res) => {
          if (res.statusCode !== 200) { try { res.resume() } catch {} ; return resolve(null) }
          const chunks = []
          res.on('data', (d) => chunks.push(d))
          res.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf8')
              const json = JSON.parse(body)
              const v = String(json?.version ?? '').trim()
              resolve(v || null)
            } catch { resolve(null) }
          })
        })
        req.setTimeout(10000, () => { try { req.destroy(new Error('timeout')) } catch {} })
        req.on('error', () => resolve(null))
      } catch { resolve(null) }
    })
  }
  return (await tryFetch()) || (await viaHttps())
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
  // Delegate to batch script for all repository access; JS only normalizes values
  try {
    const { spawn } = await import('node:child_process')
    const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
    const scriptPath = path.join(base, 'scripts', 'updater.bat')
    const p = spawn('cmd.exe', ['/c', scriptPath, 'check'], { stdio: ['ignore','pipe','ignore'] })
    let out = ''
    await new Promise((resolve) => {
      p.stdout.on('data', (d) => out += d.toString())
      p.on('close', () => resolve())
      p.on('error', () => resolve())
    })
    try {
      const parsed = JSON.parse(out || '{}')
      if (parsed && parsed.ok !== undefined) {
        // Ensure decimal compare normalization in JS as a safety net
        const li = String(parsed.localVersion ?? '0')
        const ri = String(parsed.remoteVersion ?? '0')
        parsed.updateAvailable = compareNumericVersions(li, ri) < 0
        parsed.localVersion = li
        parsed.remoteVersion = ri
        parsed.repository = APP_REPOSITORY
        return parsed
      }
    } catch {}
  } catch (e) {
    return { ok: false, error: String(e) }
  }
  // Hard fallback: attempt direct, though expected path is batch above
  const li = await getLocalVersion()
  return { ok: true, updateAvailable: false, localVersion: li, remoteVersion: '0', repository: APP_REPOSITORY }
}

async function registerIpcAndServices() {
  if (backendInitialized) return
  playtimeService = new PlaytimeService(app.getPath('userData'))
  settingsService = new SettingsService(app.getPath('userData'))
  await settingsService.load()

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
    const games = await detectionService.detectAll(settingsService.get())
    return games.map((g) => ({ ...g, playtimeMinutes: playtimeService.getPlaytimeMinutes(g) }))
  })

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
    const saved = await settingsService.save(next)
    return saved
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
      const devIcon = path.join(process.cwd(), 'Icon.png')
      const asarIcon = path.join(__dirname, '../Icon.png')
      const resIcon = path.join(process.resourcesPath || '', 'Icon.png')
      const candidates = [devIcon, asarIcon, resIcon]
      for (const p of candidates) {
        if (p && fsSync.existsSync(p)) { appIcon = nativeImage.createFromPath(p); break }
      }
    } catch {}
  }
  const isDev = !app.isPackaged
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: appIcon || undefined,
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
  ipcMain.handle('updater:check', async () => {
    // Prefer bundled batch updater on Windows; otherwise fallback to JS
    if (process.platform === 'win32') {
      try {
        const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
        const scriptPath = path.join(base, 'scripts', 'updater.bat')
        const p = spawn('cmd.exe', ['/c', scriptPath, 'check'], { stdio: ['ignore','pipe','ignore'] })
        let out = ''
        await new Promise((resolve) => {
          p.stdout.on('data', (d) => out += d.toString())
          p.on('close', () => resolve())
          p.on('error', () => resolve())
        })
        try {
          const parsed = JSON.parse(out || '{}')
          if (parsed && parsed.ok !== undefined) {
            // Normalize localVersion to our JS-detected value to avoid discrepancies
            try {
              const jsLocal = await getLocalVersion()
              parsed.localVersion = jsLocal
              // If batch failed to resolve a proper remote version, fall back to JS fetch
              let remote = String(parsed.remoteVersion || '')
              if (!remote || remote === '0.0.0') {
                try {
                  const { owner, repo } = parseOwnerRepo(APP_REPOSITORY)
                  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/Version.Json`
                  const fetched = await fetchRemoteVersionStrict(rawUrl)
                  if (fetched) {
                    remote = String(fetched)
                    parsed.remoteVersion = remote
                  }
                } catch {}
              }
              // Recompute availability using numeric policy (remote > local)
              try {
                const li = Number.parseFloat(String(jsLocal ?? '0')) || 0
                const ri = Number.parseFloat(String(remote ?? '0')) || 0
                parsed.updateAvailable = ri > li
              } catch {}
            } catch {}
            try { console.log('[Updater] versions', { local: parsed.localVersion, remote: parsed.remoteVersion, updateAvailable: parsed.updateAvailable, source: 'batch+normalized(+js-remote-if-missing)' }) } catch {}
            return parsed
          }
        } catch {}
      } catch {}
    }
    const fb = await checkForUpdate()
    try { console.log('[Updater] versions', { local: fb.localVersion, remote: fb.remoteVersion, updateAvailable: fb.updateAvailable, source: 'fallback-js' }) } catch {}
    return fb
  })
  ipcMain.handle('updater:run', async () => {
    try {
      const isDev = !app.isPackaged
      const base = isDev ? process.cwd() : process.resourcesPath
      const scriptPath = path.join(base, 'scripts', 'updater.bat')
      const env = { ...process.env }
      // Ensure desired install root: in dev update in-place, in prod install beside app under "Game Librarian"
      const desired = isDev ? base : path.join(path.join(base, '..'), 'Game Librarian')
      env.INSTALL_DIR = desired
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
      const scriptPath = path.join(base, 'scripts', 'updater.bat')
      const env = { ...process.env }
      const desired = isDev ? base : path.join(path.join(base, '..'), 'Game Librarian')
      env.INSTALL_DIR = desired
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
      const scriptDir = path.join(base, 'scripts')
      const pyGuiCandidates = [
        path.join(scriptDir, 'installer_gui.pyw'),
        path.join(scriptDir, 'installer_gui.py')
      ]
      const pyGui = pyGuiCandidates.find((p) => {
        try { return fsSync.existsSync(p) } catch { return false }
      })
      const installer = path.join(scriptDir, 'WinInstaller.bat')
      const env = { ...process.env }
      const desired = isDev ? base : path.join(path.join(base, '..'), 'Game Librarian')
      env.INSTALL_DIR = desired
      // Prefer Python GUI if available; fallback to batch
      let child
      if (pyGui) {
        // Launch via 'start' so the GUI is fully detached from the Electron process group.
        // This avoids premature termination when the app quits right after spawning.
        try {
          child = spawn('cmd.exe', ['/c', 'start', '""', 'python', path.basename(pyGui)], {
            cwd: scriptDir,
            env: { ...env, GL_LAUNCHED_FROM_APP: '1' },
            detached: true,
            windowsHide: false,
            stdio: 'ignore'
          })
        } catch {
          try {
            child = spawn('cmd.exe', ['/c', 'start', '""', 'py', path.basename(pyGui)], {
              cwd: scriptDir,
              env: { ...env, GL_LAUNCHED_FROM_APP: '1' },
              detached: true,
              windowsHide: false,
              stdio: 'ignore'
            })
          } catch {
            // fallback to batch
            child = spawn('cmd.exe', ['/c', 'start', '""', 'WinInstaller.bat'], {
              cwd: scriptDir,
              env: { ...env, GL_LAUNCHED_FROM_APP: '1' },
              detached: true,
              windowsHide: false,
              stdio: 'ignore'
            })
          }
        }
      } else {
        // Verify batch exists, then launch
        try { if (!fsSync.existsSync(installer)) throw new Error('Installer not found at ' + installer) } catch (e) { return { ok: false, error: String(e) } }
        child = spawn('cmd.exe', ['/c', 'start', '""', 'WinInstaller.bat'], {
          cwd: scriptDir,
          env: { ...env, GL_LAUNCHED_FROM_APP: '1' },
          detached: true,
          windowsHide: false,
          stdio: 'ignore'
        })
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
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})


