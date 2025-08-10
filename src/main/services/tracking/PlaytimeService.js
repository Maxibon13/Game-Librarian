import { spawn, exec } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import fsSync from 'node:fs'

export class PlaytimeService {
  running = new Map()
  storePath
  data = { sessions: {} }

  constructor(userDataDir) {
    this.storePath = path.join(userDataDir || process.cwd(), 'playtime.json')
    void this.load()
  }

  async launchGameAndTrack(game) {
    const command = this.buildLaunchCommand(game)
    const startedAt = Date.now()
    const child = spawn(command.command, command.args, { detached: true, stdio: 'ignore', shell: command.shell ?? false })
    child.unref()
    this.running.set(`${game.launcher}:${game.id}`, { start: startedAt, proc: child, pids: [] })
    // Only consider child exit as session end if we launched the game's actual executable directly.
    if (game.executablePath && command.command === game.executablePath) {
      child.on?.('exit', () => { this.finishSession(game) })
    }

    try {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        console.log('Sending session-started event:', { game: game.title, startedAt })
        windows[0].webContents.send('game:session-started', { game, startedAt })
      }
    } catch (e) {
      console.error('Failed to send session-started:', e)
    }

    // Windows process watcher: if we know installDir or executablePath, watch for the game process
    if (os.platform() === 'win32' && (game.installDir || game.executablePath || game.title)) {
      this.monitorWindowsProcessForGame(game)
    }
  }

  finishSession(game) {
    const key = `${game.launcher}:${game.id}`
    const entry = this.running.get(key)
    if (!entry) return
    const durationMs = Date.now() - entry.start
    this.running.delete(key)
    const seconds = Math.max(0, Math.floor(durationMs / 1000))
    const prevSeconds = this.getStoredSecondsForKey(key)
    this.data.sessions[key] = { seconds: prevSeconds + seconds, updatedAt: Date.now() }
    void this.save()

    try {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        console.log('Sending session-ended event:', { game: game.title, durationMs })
        windows[0].webContents.send('game:session-ended', { game, durationMs })
      }
    } catch (e) {
      console.error('Failed to send session-ended:', e)
    }
  }

  buildLaunchCommand(game) {
    if (game.launcher === 'steam') {
      const steamExe = this.findSteamExe()
      if (steamExe) {
        return { command: steamExe, args: ['-applaunch', String(game.id)] }
      }
      return this.protocol(`steam://rungameid/${game.id}`)
    }
    if (game.launcher === 'epic') {
      return this.protocol(`com.epicgames.launcher://apps/${encodeURIComponent(game.id)}?action=launch&silent=true`)
    }
    if (game.executablePath) {
      return { command: game.executablePath, args: game.args ?? [] }
    }
    return { command: process.execPath, args: [] }
  }

  protocol(uri) {
    if (os.platform() === 'win32') {
      // Use cmd /c start "" <uri>
      return { command: 'cmd', args: ['/c', 'start', '""', uri], shell: false }
    }
    if (os.platform() === 'darwin') {
      return { command: 'open', args: [uri] }
    }
    return { command: 'xdg-open', args: [uri] }
  }

  async load() {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8')
      this.data = JSON.parse(raw)
      // Backward compatibility: migrate minutes -> seconds
      if (this.data && this.data.sessions && typeof this.data.sessions === 'object') {
        for (const k of Object.keys(this.data.sessions)) {
          const s = this.data.sessions[k]
          if (s && typeof s === 'object') {
            if (typeof s.seconds !== 'number' && typeof s.minutes === 'number') {
              s.seconds = Math.max(0, Math.floor((s.minutes || 0) * 60))
              delete s.minutes
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  async save() {
    try {
      await fs.writeFile(this.storePath, JSON.stringify(this.data, null, 2), 'utf8')
    } catch { /* ignore */ }
  }

  getPlaytimeMinutes(game) {
    const key = `${game.launcher}:${game.id}`
    const seconds = this.getStoredSecondsForKey(key)
    return Math.floor(seconds / 60)
  }

  getStoredSecondsForKey(key) {
    const rec = this.data.sessions[key]
    if (!rec) return 0
    if (typeof rec.seconds === 'number') return rec.seconds
    if (typeof rec.minutes === 'number') return Math.max(0, Math.floor(rec.minutes * 60))
    return 0
  }

  resetAllPlaytime() {
    this.data.sessions = {}
    void this.save()
  }

  async forceQuit(game) {
    const key = `${game.launcher}:${game.id}`
    const entry = this.running.get(key)
    const platform = os.platform()
    try {
      if (platform === 'win32') {
        const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
        const scriptPath = path.join(base, 'scripts', 'proc.py')
        const filters = JSON.stringify({
          executablePath: game.executablePath || '',
          installDir: game.installDir || '',
          title: game.title || '',
          pids: entry?.pids || [],
          strict: true,
          preferImage: true,
          imageName: game.executablePath ? path.basename(game.executablePath) : ''
        })
        await new Promise((resolve) => {
          const runCmd = (cmd) => {
            const py = spawn(cmd, [scriptPath, 'kill', filters], { stdio: ['ignore', 'pipe', 'ignore'] })
            py.on('error', () => {
              if (cmd === 'python') return runCmd('py')
              return resolve(null)
            })
            py.on('exit', () => resolve(null))
          }
          runCmd('python')
        })
      } else {
        if (entry?.pids?.length) {
          for (const pid of entry.pids) {
            try { process.kill(pid, 'SIGKILL') } catch {}
          }
        }
      }
    } finally {
      try { entry?.proc?.kill?.('SIGKILL') } catch {}
      this.finishSession(game)
    }
  }

  async getMatchingPidsViaPython(game) {
    if (os.platform() !== 'win32') return []
    return await new Promise((resolve) => {
      try {
        const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
        const scriptPath = path.join(base, 'scripts', 'proc.py')
        const filters = JSON.stringify({
          executablePath: game.executablePath || '',
          installDir: game.installDir || '',
          title: game.title || ''
        })
        const runCmd = (cmd) => {
          const py = spawn(cmd, [scriptPath, 'check', filters], { stdio: ['ignore', 'pipe', 'ignore'] })
          let out = ''
          py.stdout.on('data', (d) => (out += d.toString()))
          py.on('error', () => {
            if (cmd === 'python') return runCmd('py')
            return resolve([])
          })
          py.on('exit', () => {
            try {
              const result = JSON.parse(out || '{}')
              const matches = Array.isArray(result.matches) ? result.matches : []
              const pids = matches.map((m) => m.pid).filter((pid) => Number.isFinite(pid))
              const alive = Array.isArray(result.alivePids) ? result.alivePids : []
              return resolve(Array.from(new Set([...pids, ...alive])).filter((pid) => Number.isFinite(pid)))
            } catch {
              return resolve([])
            }
          })
        }
        runCmd('python')
      } catch {
        return resolve([])
      }
    })
  }

  findSteamExe() {
    if (os.platform() !== 'win32') return null
    const programFilesX86 = process.env['ProgramFiles(x86)']
    const candidates = []
    if (programFilesX86) candidates.push(path.join(programFilesX86, 'Steam', 'steam.exe'))
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) candidates.push(path.join(localAppData, 'Steam', 'steam.exe'))
    for (const c of candidates) {
      try { fsSync.accessSync(c); return c } catch {}
    }
    return null
  }

  monitorWindowsProcessForGame(game) {
    const key = `${game.launcher}:${game.id}`
    let consecutiveNotRunning = 0
    const startTime = Date.now()
    // Maintain last-known-alive PIDs to avoid premature end; expire stale ones
    const stickyAlive = new Map() // pid -> lastSeenMs
    const stickyTtlMs = 4000
    const poll = async () => {
      // If session already finished, stop polling
      if (!this.running.has(key)) return
      try {
        await new Promise((resolve) => {
          const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
          const scriptPath = path.join(base, 'scripts', 'proc.py')
          const filters = JSON.stringify({
            executablePath: game.executablePath || '',
            installDir: game.installDir || '',
            title: game.title || '',
            pids: Array.from(stickyAlive.keys())
          })
          const runPython = (cmd) => {
            const py = spawn(cmd, [scriptPath, 'check', filters], { stdio: ['ignore', 'pipe', 'ignore'] })
            let out = ''
            py.stdout.on('data', (d) => (out += d.toString()))
            py.on('error', () => {
              if (cmd === 'python') return runPython('py')
              return resolve(null)
            })
            py.on('exit', () => {
              try {
                const result = JSON.parse(out || '{}')
                const matches = Array.isArray(result.matches) ? result.matches : []
                const alivePids = Array.isArray(result.alivePids) ? result.alivePids : []
                const running = !!result.running
                // Update sticky set timestamps
                const now = Date.now()
                const potentialPids = matches.map((m) => m.pid).filter((pid) => Number.isFinite(pid))
                for (const pid of [...alivePids, ...potentialPids]) {
                  if (Number.isFinite(pid)) stickyAlive.set(pid, now)
                }
                // Expire old sticky pids
                for (const [pid, ts] of Array.from(stickyAlive.entries())) {
                  if (now - ts > stickyTtlMs) stickyAlive.delete(pid)
                }

                // Console debug in requested format
                try {
                  console.log(`[proc] potential matches PID: [${potentialPids.join(', ')}], Active: [${alivePids.join(', ')}]`)
                } catch {}

                if (alivePids.length > 0 || stickyAlive.size > 0 || (running && matches.length > 0)) {
                  consecutiveNotRunning = 0
                  const entry = this.running.get(key)
                  if (entry) {
                    entry.pids = Array.from(new Set([...(entry.pids || []), ...potentialPids, ...alivePids, ...Array.from(stickyAlive.keys())]))
                  }
                } else {
                  // During initial grace period after launch, be lenient
                  const withinGrace = Date.now() - startTime < 12000
                  consecutiveNotRunning += 1
                  const threshold = withinGrace ? 4 : 2 // ~12-16s in grace, then ~6s afterwards
                  if (consecutiveNotRunning >= threshold) {
                    this.finishSession(game)
                    return resolve(null)
                  }
                }
              } catch {}
              return resolve(null)
            })
          }
          runPython('python')
        })
      } finally {
        if (this.running.has(key)) {
          setTimeout(poll, 3000)
        }
      }
    }
    setTimeout(poll, 3000)
  }
}