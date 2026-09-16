import { app, Menu, Notification, Tray, nativeImage, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

export const PROTOCOL = 'gamelibrarian'
export const APP_USER_MODEL_ID = 'com.gamelibrarian.app'

const isWin = process.platform === 'win32'

export function gameKey(game) {
  return `${game?.launcher}:${game?.id}`
}

// Windows 11 22H2 (build 22621) introduced Mica for arbitrary windows.
export function supportsMica() {
  if (!isWin) return false
  try {
    const build = Number.parseInt(String(os.release()).split('.')[2] || '0', 10)
    return build >= 22621
  } catch { return false }
}

// Parse `--play=launcher:id` or `gamelibrarian://play/launcher/id` from argv.
export function parsePlayRequest(argv) {
  for (const raw of argv || []) {
    const arg = String(raw || '')
    let m = /^--play=(.+)$/i.exec(arg)
    if (m) {
      const idx = m[1].indexOf(':')
      if (idx > 0) return { launcher: m[1].slice(0, idx), id: m[1].slice(idx + 1) }
    }
    m = new RegExp(`^${PROTOCOL}:\\/\\/play\\/([^/]+)\\/(.+?)\\/?$`, 'i').exec(arg)
    if (m) return { launcher: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) }
  }
  return null
}

// Arguments needed to relaunch this app (dev runs through electron.exe + app path).
export function launchArgsFor(extra) {
  const base = app.isPackaged ? [] : [path.resolve(process.argv[1] || '.')]
  return [...base, ...extra]
}

export function registerProtocol() {
  try {
    if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL)
    else app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, launchArgsFor([]))
  } catch {}
}

export function updateJumpList(games) {
  if (!isWin) return
  try {
    const recent = (games || [])
      .filter((g) => (g.lastPlayedAt || 0) > 0)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, 8)
    const mostPlayed = (games || [])
      .filter((g) => (g.playtimeMinutes || 0) > 0)
      .sort((a, b) => (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0))
      .slice(0, 6)
    const toItem = (g) => ({
      type: 'task',
      title: g.title,
      description: `Play ${g.title}`,
      program: process.execPath,
      args: launchArgsFor([`--play=${gameKey(g)}`]).map(quoteArg).join(' '),
      iconPath: process.execPath,
      iconIndex: 0
    })
    const categories = []
    if (recent.length) categories.push({ type: 'custom', name: 'Recent', items: recent.map(toItem) })
    if (mostPlayed.length) categories.push({ type: 'custom', name: 'Most played', items: mostPlayed.map(toItem) })
    app.setJumpList(categories.length ? categories : null)
  } catch {}
}

function quoteArg(a) {
  return /\s/.test(a) ? `"${a}"` : a
}

export class TrayController {
  constructor({ icon, onShow, onPlay, onQuit }) {
    this.tray = null
    this.icon = icon
    this.onShow = onShow
    this.onPlay = onPlay
    this.onQuit = onQuit
    this.recent = []
  }

  create() {
    if (this.tray) return
    try {
      const img = this.icon ? this.icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty()
      this.tray = new Tray(img)
      this.tray.setToolTip('Game Librarian')
      this.tray.on('click', () => this.onShow?.())
      this.tray.on('double-click', () => this.onShow?.())
      this.rebuild()
    } catch {}
  }

  setRecent(games) {
    this.recent = (games || [])
      .filter((g) => (g.lastPlayedAt || 0) > 0)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, 6)
    this.rebuild()
  }

  rebuild() {
    if (!this.tray) return
    const items = [{ label: 'Open Game Librarian', click: () => this.onShow?.() }]
    if (this.recent.length) {
      items.push({ type: 'separator' })
      for (const g of this.recent) items.push({ label: `Play ${g.title}`, click: () => this.onPlay?.(g) })
    }
    items.push({ type: 'separator' }, { label: 'Quit', click: () => this.onQuit?.() })
    this.tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  destroy() {
    try { this.tray?.destroy() } catch {}
    this.tray = null
  }
}

// Taskbar "in game" state: overlay icon + thumbnail toolbar button.
export function setInGame(win, game, { icon, onForceQuit } = {}) {
  if (!win || win.isDestroyed()) return
  try {
    if (game) {
      const overlay = icon ? icon.resize({ width: 16, height: 16 }) : null
      if (overlay) win.setOverlayIcon(overlay, `Playing ${game.title}`)
      if (isWin) {
        win.setThumbarButtons([
          {
            tooltip: `Force quit ${game.title}`,
            icon: icon ? icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty(),
            click: () => onForceQuit?.(game)
          }
        ])
      }
    } else {
      win.setOverlayIcon(null, '')
      if (isWin) win.setThumbarButtons([])
    }
  } catch {}
}

export function notifySessionEnd(game, durationMs, { icon, onClick } = {}) {
  try {
    if (!Notification.isSupported()) return
    const mins = Math.max(0, Math.round(durationMs / 60000))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    const played = h > 0 ? `${h}h ${m}m` : `${m}m`
    const n = new Notification({
      title: game.title,
      body: `Session ended · ${played} played`,
      icon: icon || undefined,
      silent: true
    })
    n.on('click', () => onClick?.())
    n.show()
  } catch {}
}

export async function createStartMenuShortcut(game, { iconPath } = {}) {
  if (!isWin) return { ok: false, error: 'Windows only' }
  try {
    const appData = process.env.APPDATA
    if (!appData) return { ok: false, error: 'APPDATA not set' }
    const dir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Game Librarian')
    await fs.mkdir(dir, { recursive: true })
    const safe = String(game.title || 'Game').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Game'
    const target = path.join(dir, `${safe}.lnk`)
    const ok = shell.writeShortcutLink(target, 'create', {
      target: process.execPath,
      args: launchArgsFor([`--play=${gameKey(game)}`]).map(quoteArg).join(' '),
      description: `Play ${game.title} with Game Librarian`,
      icon: iconPath || process.execPath,
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID
    })
    return ok ? { ok: true, path: target } : { ok: false, error: 'writeShortcutLink failed' }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
