import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GameDetectionService } from '../src/main/services/detection/GameDetectionService.js'
import { PlaytimeService } from '../src/main/services/tracking/PlaytimeService.js'
import { SettingsService } from '../src/main/services/settings/SettingsService.js'
import { SteamDetector } from '../src/main/services/detection/SteamDetector.js'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null
const detectionService = new GameDetectionService()
let playtimeService = null
let settingsService = null
let backendInitialized = false

const APP_NAME = 'Game Librarian'
const APP_REPOSITORY = 'https://github.com/Maxibon13/Game-Librarian'
// Resolve Version.Json depending on dev vs packaged
function resolveVersionJsonPath() {
  // __dirname is .../electron in both dev and packaged (inside asar)
  // Version.Json is placed at app root alongside electron/
  return path.join(__dirname, '../Version.Json')
}

async function getLocalVersion() {
  try {
    const raw = await fs.readFile(resolveVersionJsonPath(), 'utf8')
    const data = JSON.parse(raw)
    return String(data?.version || '0.0.0')
  } catch {
    return '0.0.0'
  }
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
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // In production we ship the built UI under app.asar/dist
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  // Expose updater IPC before backend is initialized
  ipcMain.handle('updater:getConfig', async () => ({ appName: APP_NAME, appRepository: APP_REPOSITORY, appVersion: await getLocalVersion(), canUpdate: true }))
  ipcMain.handle('updater:check', async () => {
    // Prefer bundled batch updater on Windows; otherwise fallback to JS
    if (process.platform === 'win32') {
      try {
        const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
        const scriptPath = path.join(base, 'scripts', 'updater.bat')
        const { spawn } = require('node:child_process')
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
            try { console.log('[Updater] versions', { local: parsed.localVersion, remote: parsed.remoteVersion, updateAvailable: parsed.updateAvailable, source: 'batch' }) } catch {}
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
      const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
      const scriptPath = path.join(base, 'scripts', 'updater.bat')
      const { spawn } = require('node:child_process')
      const env = { ...process.env }
      // Ensure desired install root
      const parent = path.join(base, '..')
      const desired = path.join(parent, 'Game Librarian')
      env.INSTALL_DIR = desired
      return await new Promise((resolve) => {
        const p = spawn('cmd.exe', ['/c', scriptPath], { stdio: 'inherit', env })
        p.on('error', () => resolve({ ok: false }))
        p.on('close', (code) => resolve({ ok: code === 0, code }))
      })
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


