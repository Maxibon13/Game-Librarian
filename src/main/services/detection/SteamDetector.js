import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parse } from 'vdf-extra'
import fg from 'fast-glob'
import { spawnSync, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export class SteamDetector {
  constructor() {
    this.type = 'steam'
    this.lastDebug = {
      steamPath: null,
      libraryFoldersFile: null,
      libraries: [],
      scannedRoots: [],
      manifests: [],
      errors: []
    }
  }

  async detect(settings) {
    // If Python is available, run the Python detector for higher accuracy
    const pythonResult = await this.tryPythonDetector(settings)
    if (pythonResult && pythonResult.games?.length) {
      // Attach images for Steam appids when possible
      const steamPath = await this.findSteamPath(settings)
      const games = []
      for (const g of pythonResult.games) {
        const image = g.id && /^\d+$/.test(String(g.id)) && steamPath ? await this.resolveSteamImage(steamPath, String(g.id)) : undefined
        const exe = await this.findLikelyExecutable(g.installDir)
        games.push({ id: g.id, title: g.title, launcher: 'steam', installDir: g.installDir, library: g.library || null, image, executablePath: exe || undefined })
      }
      this.lastDebug = {
        steamPath: steamPath || null,
        libraryFoldersFile: steamPath ? path.join(steamPath, 'steamapps', 'libraryfolders.vdf') : null,
        libraries: pythonResult.libraries || [],
        scannedRoots: [],
        manifests: games.map((g) => ({ id: g.id, title: g.title })),
        errors: []
      }
      return games
    }

    const steamPath = await this.findSteamPath(settings)
    if (!steamPath) return []
    const libraryFoldersVdf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
    this.lastDebug.steamPath = steamPath
    this.lastDebug.libraryFoldersFile = libraryFoldersVdf

    const librariesSet = new Set()
    const addLib = (p) => {
      if (!p) return
      const normalized = path.normalize(p)
      const lower = normalized.toLowerCase()
      const full = lower.endsWith(`${path.sep}steamapps`) || path.basename(normalized).toLowerCase() === 'steamapps'
        ? normalized
        : path.join(normalized, 'steamapps')
      librariesSet.add(path.normalize(full))
    }
    // Add the default Steam library under the Steam install
    addLib(steamPath)
    // include custom libraries from settings (user-provided root, not steamapps)
    const custom = settings?.steam?.customLibraries || []
    for (const p of custom) addLib(p)
    try {
      const content = await fs.readFile(libraryFoldersVdf, 'utf8')
      const parsed = parse(content)
      // New style: libraryfolders: { "contentstatsid": "...", "1": { path: "..." }, ... }
      // Some clients: libraryfolders: { paths: { "1": { path: "..." } } }
      const folders = parsed?.libraryfolders || parsed?.LibraryFolders
      if (folders?.paths && typeof folders.paths === 'object') {
        for (const k of Object.keys(folders.paths)) addLib(folders.paths[k]?.path)
      } else if (folders && typeof folders === 'object') {
        for (const key of Object.keys(folders)) {
          if (key === 'contentstatsid') continue
          const entry = folders[key]
          const p = (entry?.path || entry)?.toString?.() || ''
          if (p) addLib(p)
        }
      }
    } catch {}

    // Fallback: for any custom root that is a drive root or generic folder, search shallowly for steamapps
    const rootsToScan = new Set()
    for (const p of custom) {
      const normalized = path.normalize(p)
      const parsedPath = path.parse(normalized)
      if (normalized === parsedPath.root || /^[A-Za-z]:\\?$/.test(normalized)) {
        rootsToScan.add(parsedPath.root)
      } else {
        // also scan inside the provided folder just in case user pointed at a parent
        rootsToScan.add(normalized)
      }
    }
    for (const root of rootsToScan) {
      this.lastDebug.scannedRoots.push(root)
      try {
        const found = await fg('**/steamapps', {
          cwd: root,
          onlyDirectories: true,
          absolute: true,
          deep: 4,
          suppressErrors: true,
          dot: false
        })
        for (const d of found) librariesSet.add(path.normalize(d))
      } catch {}
    }

    // Global fallback: scan all drives for steamapps (Python parity)
    const platform = os.platform()
    if (platform === 'win32') {
      const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split('')
        .map((l) => `${l}:\\`)
      for (const drive of driveLetters) {
        try {
          await fs.access(drive)
        } catch {
          continue
        }
        try {
          const found = await fg('**/steamapps', {
            cwd: drive,
            onlyDirectories: true,
            absolute: true,
            deep: 5,
            suppressErrors: true,
            ignore: ['**/Windows/**', '**/ProgramData/**', '**/$Recycle.Bin/**', '**/System Volume Information/**']
          })
          for (const d of found) librariesSet.add(path.normalize(d))
        } catch {}
      }
    }

    const games = []
    const libraries = Array.from(librariesSet)
    this.lastDebug.libraries = libraries
    for (const lib of libraries) {
      try {
        await fs.access(lib)
        const files = await fs.readdir(lib)
        const manifestFiles = files.filter((f) => f.toLowerCase().startsWith('appmanifest') && f.toLowerCase().endsWith('.acf'))
        for (const file of manifestFiles) {
          try {
            const app = parse(await fs.readFile(path.join(lib, file), 'utf8'))
            const appState = app?.AppState
            if (!appState) continue
            const id = appState.appid
            const name = appState.name
            const installDir = appState.installdir
            const commonDir = path.join(lib, 'common', installDir)
            const image = await this.resolveSteamImage(steamPath, String(id))
            const exe = await this.findLikelyExecutable(commonDir)
            games.push({ id, title: name, launcher: 'steam', installDir: commonDir, image, executablePath: exe || undefined, library: lib })
            this.lastDebug.manifests.push({ lib, file, id, title: name })
          } catch (e) {
            // Fallback to regex like the Python script to extract name
            try {
              const raw = await fs.readFile(path.join(lib, file), 'utf8')
              const nameMatch = /"name"\s+"([^"]+)"/i.exec(raw)
              const idMatch = /"appid"\s+"(\d+)"/i.exec(raw)
              const installMatch = /"installdir"\s+"([^"]+)"/i.exec(raw)
              if (nameMatch && installMatch) {
                const id = idMatch ? idMatch[1] : `unknown-${file}`
                const name = nameMatch[1]
                const installDir = installMatch[1]
                const commonDir = path.join(lib, 'common', installDir)
                const image = idMatch ? await this.resolveSteamImage(steamPath, String(id)) : undefined
                const exe = await this.findLikelyExecutable(commonDir)
                games.push({ id, title: name, launcher: 'steam', installDir: commonDir, image, executablePath: exe || undefined, library: lib })
                this.lastDebug.manifests.push({ lib, file, id, title: name })
              }
            } catch {}
            this.lastDebug.errors.push(String(e))
          }
        }
      } catch (e) { this.lastDebug.errors.push(String(e)) }
    }

    // Optional: deep heuristic scan can produce duplicates/false-positives; disable to avoid duplicates
    return games
  }

  async findSteamPath(settings) {
    if (settings?.steam?.steamPath) {
      try { await fs.access(settings.steam.steamPath); return settings.steam.steamPath } catch {}
    }
    const platform = os.platform()
    if (platform === 'win32') {
      // 1) Registry HKCU (most reliable)
      const regPaths = [
        'HKCU/Software/Valve/Steam',
        'HKLM/Software/Wow6432Node/Valve/Steam',
        'HKLM/Software/Valve/Steam'
      ]
      for (const key of regPaths) {
        try {
          const { stdout } = spawnSync('reg', ['query', key.replaceAll('/', '\\'), '/v', 'SteamPath'], { encoding: 'utf8' })
          const match = stdout && stdout.split('\n').find((l) => l.includes('SteamPath'))
          if (match) {
            const parts = match.trim().split(/\s{2,}/)
            const p = parts[parts.length - 1]
            if (p) {
              await fs.access(p)
              return p
            }
          }
        } catch {}
      }

      const local = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles
      if (local) {
        const p = path.join(local, 'Steam')
        try { await fs.access(p); return p } catch {}
      }
      const userData = process.env.LOCALAPPDATA
      if (userData) {
        const p = path.join(userData, 'Steam')
        try { await fs.access(p); return p } catch {}
      }
      // 2) As a last resort, scan common install locations on C:\
      try {
        const found = await fg(['C:/Program Files (x86)/Steam', 'C:/Program Files/Steam', 'C:/**/Steam'], {
          onlyDirectories: true,
          absolute: true,
          deep: 2,
          suppressErrors: true
        })
        for (const d of found) {
          try { await fs.access(path.join(d, 'steamapps')); return d } catch {}
        }
      } catch {}
    }
    return null
  }

  async resolveSteamImage(steamPath, appId) {
    const cacheDir = path.join(steamPath, 'appcache', 'librarycache')
    const candidates = [
      `${appId}_library_600x900.jpg`,
      `${appId}_library_600x900.png`,
      `${appId}_header.jpg`,
      `${appId}_header.png`,
      `${appId}_capsule_616x353.jpg`,
      `${appId}_capsule_616x353.png`
    ]
    for (const file of candidates) {
      const candidatePath = path.join(cacheDir, file)
      try { await fs.access(candidatePath); return pathToFileURL(candidatePath).href } catch {}
    }
    // Remote fallback via Steam CDN
    return `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`
  }

  async findLikelyExecutable(folderPath) {
    try {
      const candidates = await fg(['**/*.exe'], {
        cwd: folderPath,
        absolute: true,
        deep: 2,
        suppressErrors: true
      })
      const bad = /(vcredist|dxsetup|directx|redist|depots|unins|crash|helper|support|_commonredist|eac|easyanticheat|installer)/i
      const filtered = candidates.filter((p) => !bad.test(p))
      // Prefer exe that matches folder name
      const base = path.basename(folderPath).toLowerCase()
      const preferred = filtered.find((p) => path.basename(p).toLowerCase().includes(base)) || filtered[0]
      return preferred || null
    } catch {
      return null
    }
  }

  async tryPythonDetector(settings) {
    // Try 'python' and 'py' commands. Resolve script path for packaged build
    const extras = JSON.stringify(settings?.steam?.customLibraries || [])
    const base = (await import('electron')).app?.isPackaged ? process.resourcesPath : process.cwd()
    const scriptPath = path.join(base, 'scripts', 'steam_detect.py')
    const candidates = [
      ['python', [scriptPath, extras]],
      ['py', [scriptPath, extras]]
    ]
    for (const [cmd, args] of candidates) {
      try {
        const out = await new Promise((resolve, reject) => {
          const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
          let stdout = ''
          let stderr = ''
          p.stdout.on('data', (d) => (stdout += d.toString()))
          p.stderr.on('data', (d) => (stderr += d.toString()))
          p.on('error', reject)
          p.on('close', (code) => {
            if (code === 0 && stdout) resolve(stdout)
            else reject(new Error(stderr || `python exited ${code}`))
          })
        })
        const parsed = JSON.parse(out)
        if (parsed?.games) return parsed
      } catch {}
    }
    return null
  }
}


