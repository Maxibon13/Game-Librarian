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
    this.running.set(`${game.launcher}:${game.id}`, { start: startedAt, proc: child, pids: [], parentPid: child.pid })
    // Only consider child exit as session end if we launched the game's actual executable directly.
    if (os.platform() !== 'win32' && game.executablePath && command.command === game.executablePath) {
      child.on?.('exit', () => { this.finishSession(game, 'child-exit') })
    }

    try {
      const DEBUG = true
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        if (DEBUG) console.log('[PlaytimeDetector] session-started', { title: game.title, startedAt, cmd: command })
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

  finishSession(game, reason) {
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
      console.log('[PlaytimeDetector] session-ended', { title: game.title, durationMs, reason: reason || 'unknown' })
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        windows[0].webContents.send('game:session-ended', { game, durationMs, reason })
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
    if (game.launcher === 'minecraft') {
      if (game.executablePath) return { command: game.executablePath, args: [] }
      // Try protocol as fallback
      return this.protocol('minecraft:')
    }
    if (game.launcher === 'roblox') {
      if (game.executablePath) return { command: game.executablePath, args: [] }
      return this.protocol('roblox-player:')
    }
    if (game.launcher === 'msstore') {
      // Prefer shell AppsFolder URI when available (PackageFamilyName!AppId)
      const uri = (game && (game.appUri || (game.pfn && game.appId ? `shell:AppsFolder\\${game.pfn}!${game.appId}` : null)))
      if (uri) return this.protocol(uri)
      // Fallback to Store PDP by product id if present
      if (game.productId) return this.protocol(`ms-windows-store://pdp/?productid=${encodeURIComponent(game.productId)}`)
      // Final fallback opens Microsoft Store home
      return this.protocol('ms-windows-store:')
    }
    if (game.executablePath) {
      return { command: game.executablePath, args: game.args ?? [] }
    }
    return { command: process.execPath, args: [] }
  }

  protocol(uri) {
    if (os.platform() === 'win32') {
      // Use explorer to open URIs for better reliability with AppsFolder
      // e.g., explorer.exe shell:AppsFolder\\<PFN>!<AppId>
      return { command: 'explorer.exe', args: [uri], shell: false }
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
          title: (game.title || '').toLowerCase(),
          imageName: game.executablePath ? path.basename(game.executablePath) : ''
        })
        const runCmd = (cmd) => {
          const py = spawn(cmd, [scriptPath, 'find', filters], { stdio: ['ignore', 'pipe', 'ignore'] })
          let out = ''
          py.stdout.on('data', (d) => (out += d.toString()))
          py.on('error', () => {
            if (cmd === 'python') return runCmd('py')
            return resolve([])
          })
          py.on('exit', () => {
            try {
              const result = JSON.parse(out || '{}')
              const pids = Array.isArray(result.pids) ? result.pids : []
              return resolve(pids.filter((pid) => Number.isFinite(pid)))
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
    const startTime = Date.now()
    let trackedPids = new Set()
    let seeded = false
    const seedWindowMs = 45000
    const graceAfterEmptyMs = 3500
    let emptySinceTs = null
    const DEBUG = true
    const log = (...args) => { if (DEBUG) console.log('[PlaytimeDetector]', ...args) }

    log('monitor start', {
      key,
      title: game.title,
      launcher: game.launcher,
      id: game.id,
      executablePath: game.executablePath,
      installDir: game.installDir
    })
    const runPythonJson = (args) => new Promise((resolve) => {
      const base = app && app.isPackaged ? process.resourcesPath : process.cwd()
      const scriptPath = path.join(base, 'scripts', 'proc.py')
      const tryRun = (cmd) => {
        const py = spawn(cmd, [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
        let out = ''
        py.stdout.on('data', (d) => (out += d.toString()))
        py.on('error', () => {
          if (cmd === 'python') return tryRun('py')
          return resolve(null)
        })
        py.on('exit', () => {
          try {
            resolve(JSON.parse(out || '{}'))
          } catch {
            resolve(null)
          }
        })
      }
      tryRun('python')
    })

    const poll = async () => {
      if (!this.running.has(key)) return
      try {
        // Attempt initial seeding within a generous window to catch delayed spawns
        if (!seeded && (Date.now() - startTime) < seedWindowMs) {
          const findFilters = JSON.stringify({
            executablePath: game.executablePath || '',
            installDir: game.installDir || '',
            title: (game.title || '').toLowerCase(),
            imageName: game.executablePath ? path.basename(game.executablePath) : '',
            parentPid: this.running.get(key)?.parentPid || null
          })
          const res = await runPythonJson(['find', findFilters])
          const pids = Array.isArray(res?.pids) ? res.pids.filter((p) => Number.isFinite(p)) : []
          if (DEBUG) {
            log('find(seed)', { pids, matches: (res?.matches || []).slice(0, 5), ts: res?.ts })
          }
          if (pids.length > 0) {
            trackedPids = new Set(pids)
            seeded = true
            const entry = this.running.get(key)
            if (entry) entry.pids = [...trackedPids]
          }
        }

        if (trackedPids.size > 0) {
          const aliveFilters = JSON.stringify({ pids: [...trackedPids] })
          const aliveRes = await runPythonJson(['alive', aliveFilters])
          const alive = Array.isArray(aliveRes?.pids) ? aliveRes.pids.filter((p) => Number.isFinite(p)) : []
          if (DEBUG) log('alive(check)', { before: [...trackedPids], alive })
          trackedPids = new Set(alive)
          const entry = this.running.get(key)
          if (entry) entry.pids = [...trackedPids]

          
        // Regular reacquire to catch new PIDs beyond initial seed window
        if (seeded && trackedPids.size > 0) {
          const findFilters = JSON.stringify({
            executablePath: game.executablePath || '',
            installDir: game.installDir || '',
            title: (game.title || '').toLowerCase(),
            imageName: game.executablePath ? path.basename(game.executablePath) : ''
          });
          let res = null;
          try { 
            res = await runPythonJson(['find', findFilters]); 
          } catch (err) { 
            log('periodic reacquire error', err); 
            res = null; 
          }
          const newlyFound = Array.isArray(res?.pids) ? res.pids.filter((p) => Number.isFinite(p)) : [];
          if (DEBUG) log('find(periodic)', { newlyFound, matches: (res?.matches || []).slice(0, 5) });
          if (newlyFound.length > 0) {
            trackedPids = new Set(newlyFound);
            const entry = this.running.get(key);
            if (entry) entry.pids = [...trackedPids];
          }
        }
if (seeded && trackedPids.size === 0) {
            // Possible handoff from launcher stub -> real game process. Try re-acquire within grace.
            if (emptySinceTs == null) emptySinceTs = Date.now()
            const since = Date.now() - emptySinceTs
            const findFilters = JSON.stringify({
              executablePath: game.executablePath || '',
              installDir: game.installDir || '',
              title: (game.title || '').toLowerCase(),
              imageName: game.executablePath ? path.basename(game.executablePath) : '',
              parentPid: this.running.get(key)?.parentPid || null
            })
            const res = await runPythonJson(['find', findFilters])
            const reFound = Array.isArray(res?.pids) ? res.pids.filter((p) => Number.isFinite(p)) : []
            if (DEBUG) log('find(reacquire)', { reFound, matches: (res?.matches || []).slice(0, 5), since })
            if (reFound.length > 0) {
              trackedPids = new Set(reFound)
              if (entry) entry.pids = [...trackedPids]
              emptySinceTs = null
            } else if (since >= graceAfterEmptyMs) {
              log('ending session: no alive PIDs after grace window')
              this.finishSession(game, 'no-alive-pids-after-grace')
              return
            }
          } else {
            emptySinceTs = null
          }
        } else if (seeded) {
          // Seeded but nothing alive. Try a quick re-acquire attempt before ending.
          if (emptySinceTs == null) emptySinceTs = Date.now()
          const since = Date.now() - emptySinceTs
          const findFilters = JSON.stringify({
            executablePath: game.executablePath || '',
            installDir: game.installDir || '',
            title: (game.title || '').toLowerCase(),
            imageName: game.executablePath ? path.basename(game.executablePath) : '',
            parentPid: this.running.get(key)?.parentPid || null
          })
          const res = await runPythonJson(['find', findFilters])
          const reFound = Array.isArray(res?.pids) ? res.pids.filter((p) => Number.isFinite(p)) : []
          if (DEBUG) log('find(reacquire-initial)', { reFound, matches: (res?.matches || []).slice(0, 5), since })
          if (reFound.length > 0) {
            trackedPids = new Set(reFound)
            const entry = this.running.get(key)
            if (entry) entry.pids = [...trackedPids]
            emptySinceTs = null
          } else if (since >= graceAfterEmptyMs) {
            log('ending session: seeded but no PIDs found after grace window')
            this.finishSession(game, 'seeded-no-pids-after-grace')
            return
          }
        } else if ((Date.now() - startTime) >= seedWindowMs) {
          // Could not seed within window -> consider it closed
          log('ending session: could not seed any PIDs within seed window')
          this.finishSession(game, 'no-seed-within-window')
          return
        }
      } finally {
        if (this.running.has(key)) setTimeout(poll, 200)
      }
    }
    setTimeout(poll, 150)
  }
}