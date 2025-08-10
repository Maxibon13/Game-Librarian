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

async function loadAppConfig() {
  try {
    const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
    const p = path.join(base, 'appconfig.json')
    const raw = await fs.readFile(p, 'utf8')
    const cfg = JSON.parse(raw)
    return cfg
  } catch {
    return { appName: 'Game Librarian', appRepository: 'https://github.com/Maxibon13/Game-Librarian', appVersion: '0.1.0', canUpdate: true }
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
  const cfg = await loadAppConfig()
  const { owner, repo } = parseOwnerRepo(cfg.appRepository || cfg.AppRepository || 'https://github.com/Maxibon13/Game-Librarian')
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`
  try {
    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error(`http ${res.status}`)
    const remotePkg = await res.json()
    const remoteVersion = remotePkg?.version || '0.0.0'
    const localVersion = cfg.appVersion || cfg.AppVersion || '0.0.0'
    const cmp = compareSemver(remoteVersion, localVersion)
    return {
      ok: true,
      updateAvailable: cmp > 0 && !!(cfg.canUpdate ?? cfg.CanUpdate ?? true),
      localVersion,
      remoteVersion,
      repository: cfg.appRepository || cfg.AppRepository
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
  ipcMain.handle('updater:getConfig', async () => loadAppConfig())
  ipcMain.handle('updater:check', async () => {
    // Prefer Python helper if available (parity with other scripts)
    try {
      const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
      const scriptPath = path.join(base, 'scripts', 'updater.py')
      const cfg = await loadAppConfig()
      const payload = JSON.stringify({ repository: cfg.appRepository || cfg.AppRepository, localVersion: cfg.appVersion || cfg.AppVersion, canUpdate: cfg.canUpdate ?? cfg.CanUpdate ?? true })
      const run = (cmd) => new Promise((resolve, reject) => {
        const { spawn } = require('node:child_process')
        const p = spawn(cmd, [scriptPath, 'check', payload], { stdio: ['ignore','pipe','ignore'] })
        let out = ''
        p.stdout.on('data', (d) => out += d.toString())
        p.on('error', reject)
        p.on('close', () => {
          try { resolve(JSON.parse(out || '{}')) } catch { resolve(null) }
        })
      })
      let res = await run('python').catch(async () => await run('py').catch(() => null))
      if (res && res.ok !== undefined) return res
    } catch {}
    return checkForUpdate()
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


