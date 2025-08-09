import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GameDetectionService } from '../src/main/services/detection/GameDetectionService.js'
import { PlaytimeService } from '../src/main/services/tracking/PlaytimeService.js'
import { SettingsService } from '../src/main/services/settings/SettingsService.js'
import { SteamDetector } from '../src/main/services/detection/SteamDetector.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null
const detectionService = new GameDetectionService()
let playtimeService = null
let settingsService = null

async function registerIpcAndServices() {
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
  await registerIpcAndServices()
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})


