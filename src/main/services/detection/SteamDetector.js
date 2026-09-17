import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parse } from 'vdf-extra'
import fg from 'fast-glob'
import { driveRoots, findSteamLibraries, registryValue } from './LibraryLocations.js'
import { steamImages } from './SteamArtwork.js'

export class SteamDetector {
  constructor({ getDriveRoots = driveRoots } = {}) {
    this.getDriveRoots = getDriveRoots
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
    try { console.log('[Detector:Steam]: Initialising') } catch {}
    const steamPath = await this.findSteamPath(settings)
    const libraryFoldersVdf = steamPath ? path.join(steamPath, 'steamapps', 'libraryfolders.vdf') : null
    this.lastDebug = { steamPath, libraryFoldersFile: libraryFoldersVdf, libraries: [], scannedRoots: [], manifests: [], errors: [] }

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
    for (const config of steamPath ? [libraryFoldersVdf, path.join(steamPath, 'config', 'libraryfolders.vdf')] : []) {
      try {
        const content = await fs.readFile(config, 'utf8')
        const parsed = parse(content, { mergeRoots: false, parseNumbers: false })
        // New style: libraryfolders: { "contentstatsid": "...", "1": { path: "..." }, ... }
        // Some clients: libraryfolders: { paths: { "1": { path: "..." } } }
        const folders = parsed?.libraryfolders || parsed?.LibraryFolders
        if (folders?.paths && typeof folders.paths === 'object') {
          for (const k of Object.keys(folders.paths)) addLib(folders.paths[k]?.path)
        } else if (folders && typeof folders === 'object') {
          for (const key of Object.keys(folders)) {
            if (!/^\d+$/.test(key)) continue
            const entry = folders[key]
            const p = (entry?.path || entry)?.toString?.() || ''
            if (p) addLib(p)
          }
        }
      } catch {}
    }
    // Include detached libraries and custom installs even if Steam itself is absent.
    const roots = [...custom, ...await this.getDriveRoots()]
    this.lastDebug.scannedRoots = roots
    for (const lib of await findSteamLibraries(roots)) librariesSet.add(path.normalize(lib))

    const games = []
    const libraries = Array.from(librariesSet)
    this.lastDebug.libraries = libraries
    try { console.log(`[Detector:Steam]: Found Library at "${steamPath}"`) } catch {}
    for (const lib of libraries) {
      try {
        await fs.access(lib)
        const files = await fs.readdir(lib)
        const manifestFiles = files.filter((f) => f.toLowerCase().startsWith('appmanifest') && f.toLowerCase().endsWith('.acf'))
        for (const file of manifestFiles) {
          try {
            const app = parse(await fs.readFile(path.join(lib, file), 'utf8'), { mergeRoots: false, parseNumbers: false })
            const appState = app?.AppState
            if (!appState) continue
            const id = appState.appid
            const name = appState.name
            const installDir = appState.installdir
            const commonDir = path.join(lib, 'common', installDir)
            const images = await steamImages(steamPath, String(id))
            const image = images[0]
            const exe = await this.findLikelyExecutable(commonDir)
            games.push({ id, title: name, launcher: 'steam', installDir: commonDir, image, images, executablePath: exe || undefined, library: lib })
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
                const images = idMatch ? await steamImages(steamPath, String(id)) : []
                const image = images[0]
                const exe = await this.findLikelyExecutable(commonDir)
                games.push({ id, title: name, launcher: 'steam', installDir: commonDir, image, images, executablePath: exe || undefined, library: lib })
                this.lastDebug.manifests.push({ lib, file, id, title: name })
              }
            } catch {}
            this.lastDebug.errors.push(String(e))
          }
        }
      } catch (e) { this.lastDebug.errors.push(String(e)) }
    }

    // Optional: deep heuristic scan can produce duplicates/false-positives; disable to avoid duplicates
    try { console.log(`[Detector:Steam]: Found Games : ${JSON.stringify(games.map(g=>({id:g.id,title:g.title})))}`) } catch {}
    try { console.log('[Detector:Steam]: Code ok') } catch {}
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
        for (const value of ['SteamPath', 'InstallPath']) {
          const p = await registryValue(key.replaceAll('/', '\\'), value)
          if (p) { try { await fs.access(p); return p } catch {} }
        }
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

  async findLikelyExecutable(folderPath) {
    try {
      const candidates = await fg(['**/*.exe'], {
        cwd: folderPath,
        absolute: true,
        deep: 4,
        suppressErrors: true
      })
      const bad = /(vcredist|dxsetup|directx|redist|depots|unins|crash|helper|support|_commonredist|eac|easyanticheat|installer)/i
      const filtered = candidates.filter((p) => !bad.test(path.relative(folderPath, p)))
      // Prefer exe that matches folder name
      const base = path.basename(folderPath).toLowerCase()
      const preferred = filtered.find((p) => path.basename(p).toLowerCase().includes(base)) || filtered[0]
      return preferred || null
    } catch {
      return null
    }
  }

}
