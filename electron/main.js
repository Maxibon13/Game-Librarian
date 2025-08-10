import { app, BrowserWindow, ipcMain, shell } from 'electron'
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
const detectionService = new GameDetectionService()
let playtimeService = null
let settingsService = null
let backendInitialized = false
let lastVersionJsonPath = null

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
  let fallback = '0.0.0'
  try { fallback = String(app.getVersion ? app.getVersion() : '0.0.0') } catch {}
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

function compareSemver(a, b) {
  const toNums = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0)
  const [a1, a2, a3] = toNums(a)
  const [b1, b2, b3] = toNums(b)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
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
  const cfg = { appRepository: APP_REPOSITORY }
  const localVersion = await getLocalVersion()
  const { owner, repo } = parseOwnerRepo(cfg.appRepository || 'https://github.com/Maxibon13/Game-Librarian')
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/Version.Json`
  try {
    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error(`http ${res.status}`)
    const remoteJson = await res.json()
    const remoteVersion = remoteJson?.version || '0.0.0'
    const cmp = compareSemver(remoteVersion, localVersion)
    return {
      ok: true,
      updateAvailable: cmp > 0,
      localVersion,
      remoteVersion,
      repository: cfg.appRepository
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function registerIpcAndServices() {
  if (backendInitialized) return
  playtimeService = new PlaytimeService(app.getPath('userData'))
  settingsService = new SettingsService(app.getPath('userData'))
  await settingsService.load()

  ipcMain.handle('games:list', async () => {
    const games = await detectionService.detectAll(settingsService.get())
    return games.map((g) => ({ ...g, playtimeMinutes: playtimeService.getPlaytimeMinutes(g) }))
  })

  ipcMain.handle('game:launch', async (_e, game) => {
    await playtimeService.launchGameAndTrack(game)
    return true
  })

  ipcMain.handle('open:external', async (_e, url) => {
    await shell.openExternal(url)
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

  ipcMain.handle('debug:steam', async () => {
    const steam = detectionService.detectors.find((d) => d.type === 'steam')
    return steam && steam.lastDebug ? steam.lastDebug : null
  })
  backendInitialized = true
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const isDev = !app.isPackaged
  if (isDev) {
    const cfg = settingsService ? settingsService.get() : { dev: { autoStartVite: false } }
    const shouldAutoStartVite = !!(cfg && cfg.dev && cfg.dev.autoStartVite)
    const url = 'http://localhost:5173'
    if (shouldAutoStartVite) {
      try {
        // Spawn Vite hidden without a visible console (Windows hidden via start + /B)
        const isWin = process.platform === 'win32'
        if (isWin) {
          // Use cmd to start npm run vite in background without new window
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
    mainWindow.webContents.openDevTools({ mode: 'detach' })
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
              // Recompute availability using normalized local and reported remote
              try {
                const remote = String(parsed.remoteVersion || '')
                parsed.updateAvailable = compareSemver(remote, jsLocal) > 0
              } catch {}
            } catch {}
            try { console.log('[Updater] versions', { local: parsed.localVersion, remote: parsed.remoteVersion, updateAvailable: parsed.updateAvailable, source: 'batch+normalized' }) } catch {}
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
      const installer = path.join(scriptDir, 'InstallerLite.bat')
      const env = { ...process.env }
      const desired = isDev ? base : path.join(path.join(base, '..'), 'Game Librarian')
      env.INSTALL_DIR = desired
      // Verify installer exists
      try { if (!fsSync.existsSync(installer)) throw new Error('Installer not found at ' + installer) } catch (e) { return { ok: false, error: String(e) } }
      // Launch installer in a new window and detach so it continues after app quits
      const child = spawn('cmd.exe', ['/c', 'start', '""', 'InstallerLite.bat'], {
        cwd: scriptDir,
        env,
        detached: true,
        windowsHide: false,
        stdio: 'ignore'
      })
      child.unref()
      // In dev, stop Vite to clean up the console instead of quitting the app.
      // In production, quit the app as before.
      if (isDev) {
        await stopDevViteIfRunning()
      } else {
        setTimeout(() => { try { app.quit() } catch {} }, 150)
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


