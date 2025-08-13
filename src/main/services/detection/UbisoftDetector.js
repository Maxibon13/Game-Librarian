import { spawnSync, spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export class UbisoftDetector {
  constructor() { this.type = 'ubisoft' }

  async detect(settings) {
    if (process.platform !== 'win32') return []
    try { console.log('[Detector:Ubisoft]: Initialising') } catch {}
    // Prefer Python detector for better accuracy
    const py = await this.tryPythonDetector(settings)
    if (py && Array.isArray(py.games) && py.games.length) {
      const baseGames = py.games.map((g) => ({ id: g.id, title: g.title, launcher: 'ubisoft', installDir: g.installDir, executablePath: g.executablePath || undefined, image: g.image }))
      const withFallback = await Promise.all(baseGames.map(async (g) => {
        if (g.image) return g
        try {
          const steamImg = await this.trySteamCommunityImage(g.title)
          return steamImg ? { ...g, image: steamImg } : g
        } catch { return g }
      }))
      try { console.log(`[Detector:Ubisoft]: Found Library at "Registry+DefaultDir"`) } catch {}
      try { console.log(`[Detector:Ubisoft]: Found Games : ${JSON.stringify(withFallback.map(g=>({id:g.id,title:g.title})))}`) } catch {}
      try { console.log('[Detector:Ubisoft]: Code ok') } catch {}
      return withFallback
    }
    const games = []
    const regInstalls = []
    // Ubisoft Connect stores games under HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs
    try {
      const root = 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs'
      const { stdout } = spawnSync('reg', ['query', root], { encoding: 'utf8' })
      const subkeys = (stdout || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('HKEY'))
      for (const key of subkeys) {
        try {
          const q = spawnSync('reg', ['query', key], { encoding: 'utf8' })
          const text = q.stdout || ''
          const installMatch = /\sInstallDir\s+REG_SZ\s+(.+)/i.exec(text)
          const nameMatch = /\sDisplayName\s+REG_SZ\s+(.+)/i.exec(text)
          const title = (nameMatch?.[1] || key.split('\\').pop() || '').trim()
          const installDir = (installMatch?.[1] || '').trim()
          if (!installDir) continue
          try { await fs.access(installDir) } catch { continue }
          const exe = await this.findLikelyExecutable(installDir)
          const id = key.split('\\').pop() || path.basename(installDir)
          regInstalls.push({ id, installDir: installDir.toLowerCase(), title })
          const friendly = await this.friendlyTitle(title, exe, installDir, id)
          games.push({ id, title: friendly, launcher: 'ubisoft', installDir, executablePath: exe || undefined, image: await this.resolveUbisoftImage(installDir) })
        } catch {}
      }
    } catch {}
    
    // Default Ubisoft games directory: C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games
    try {
      const base = process.env['ProgramFiles(x86)'] || ''
      const defaultDir = path.join(base, 'Ubisoft', 'Ubisoft Game Launcher', 'games')
      const entries = await fs.readdir(defaultDir, { withFileTypes: true })
      for (const ent of entries) {
        if (!ent.isDirectory()) continue
        const dir = path.join(defaultDir, ent.name)
        const exe = await this.findLikelyExecutable(dir)
        if (!exe) continue
        let title = ent.name
        const matchByDir = regInstalls.find((r) => r.installDir === dir.toLowerCase())
        if (matchByDir) title = matchByDir.title
        else if (/^\d+$/.test(ent.name)) {
          const matchById = regInstalls.find((r) => r.id === ent.name)
          if (matchById) title = matchById.title
        }
        const friendly = await this.friendlyTitle(title, exe, dir, ent.name)
        games.push({ id: ent.name, title: friendly, launcher: 'ubisoft', installDir: dir, executablePath: exe, image: await this.resolveUbisoftImage(dir) })
      }
    } catch {}

    // Also scan user-provided custom libraries for executables as a fallback
    // Also scan user-provided custom libraries for executables as a fallback
    try {
      const { default: fg } = await import('fast-glob')
      const libs = settings?.ubisoft?.customLibraries || []
      for (const root of libs) {
        try {
          const candidates = await fg(['**/*.exe'], { cwd: root, absolute: true, deep: 3, suppressErrors: true })
          for (const exe of candidates) {
            let title = path.basename(exe, '.exe')
            const dir = path.dirname(exe)
            const matchByDir = regInstalls.find((r) => r.installDir === dir.toLowerCase())
            if (matchByDir) title = matchByDir.title
            const friendly = await this.friendlyTitle(title, exe, dir, path.basename(dir))
            games.push({ id: path.basename(dir), title: friendly, launcher: 'ubisoft', installDir: dir, executablePath: exe, image: await this.resolveUbisoftImage(dir) })
          }
        } catch {}
      }
    } catch {}
    // Attach Steam community image fallback where local image is missing
    const results = await Promise.all(games.map(async (g) => {
      if (g.image) return g
      try {
        const steamImg = await this.trySteamCommunityImage(g.title)
        return steamImg ? { ...g, image: steamImg } : g
      } catch { return g }
    }))
    try { console.log(`[Detector:Ubisoft]: Found Library at "Registry+DefaultDir+CustomLibs"`) } catch {}
    try { console.log(`[Detector:Ubisoft]: Found Games : ${JSON.stringify(results.map(g=>({id:g.id,title:g.title})))}`) } catch {}
    try { console.log('[Detector:Ubisoft]: Code ok') } catch {}
    return results
  }

  async findLikelyExecutable(folderPath) {
    try {
      const { default: fg } = await import('fast-glob')
      const candidates = await fg(['**/*.exe'], { cwd: folderPath, absolute: true, deep: 2, suppressErrors: true })
      const bad = /(vcredist|dxsetup|directx|redist|depots|unins|crash|helper|support|_commonredist|eac|easyanticheat|installer|uplay|ubisoft)/i
      const filtered = candidates.filter((p) => !bad.test(p))
      const base = path.basename(folderPath).toLowerCase()
      return filtered.find((p) => path.basename(p).toLowerCase().includes(base)) || filtered[0] || null
    } catch { return null }
  }

  async resolveUbisoftImage(installDirOrBase) {
    try {
      // Prefer icon near executable/dir
      const { default: fg } = await import('fast-glob')
      const localIcons = await fg(['**/*.ico'], { cwd: installDirOrBase, absolute: true, deep: 2, suppressErrors: true })
      if (localIcons?.length) return pathToFileURL(localIcons[0]).href
      // Fallback to Ubisoft data\games pool (unmapped; pick first as generic)
      const base = process.env['ProgramFiles(x86)'] || ''
      const imgDir = path.join(base, 'Ubisoft', 'Ubisoft Game Launcher', 'data', 'games')
      const pool = await fg(['*.ico'], { cwd: imgDir, absolute: true, suppressErrors: true })
      if (pool?.length) return pathToFileURL(pool[0]).href
    } catch {}
    return undefined
  }

  async friendlyTitle(currentTitle, exePath, installDir, fallbackId) {
    // If currentTitle looks like a numeric id, try file version info
    if (currentTitle && !/^[0-9]+$/.test(currentTitle)) return currentTitle
    // Try exe version info
    if (exePath) {
      try {
        const ps = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Item '${exePath.replace(/'/g, "''")}').VersionInfo.FileDescription`], { encoding: 'utf8' })
        const desc = (ps.stdout || '').trim()
        if (desc) return desc
        const ps2 = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Item '${exePath.replace(/'/g, "''")}').VersionInfo.ProductName`], { encoding: 'utf8' })
        const prod = (ps2.stdout || '').trim()
        if (prod) return prod
      } catch {}
    }
    // Fallback: folder name without numeric-only
    const base = path.basename(installDir || '')
    if (base && !/^[0-9]+$/.test(base)) return base
    return currentTitle || fallbackId || base || 'Ubisoft Game'
  }

  async tryPythonDetector(settings) {
    try {
      const { spawn } = await import('node:child_process')
      const base = (await import('electron')).app?.isPackaged ? process.resourcesPath : process.cwd()
      const script = path.join(base, 'scripts', 'ubisoft_detect.py')
      const extras = JSON.stringify(settings?.ubisoft?.customLibraries || [])
      return await new Promise((resolve) => {
        const p = spawn('python', [script, extras], { stdio: ['ignore', 'pipe', 'ignore'] })
        let out = ''
        p.stdout.on('data', (d) => (out += d.toString()))
        p.on('error', () => resolve(null))
        p.on('close', () => {
          try { resolve(JSON.parse(out || '{}')) } catch { resolve(null) }
        })
      })
    } catch { return null }
  }

  async trySteamCommunityImage(gameTitle) {
    try {
      const base = (await import('electron')).app?.isPackaged ? process.resourcesPath : process.cwd()
      const scriptPath = path.join(base, 'scripts', 'SteamApi_Search.py')
      const candidates = [
        ['python', [scriptPath, '--game', gameTitle]],
        ['py', [scriptPath, '--game', gameTitle]]
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
          const url = parsed && parsed.imageUrl
          if (url && typeof url === 'string' && url.startsWith('http')) return url
        } catch {}
      }
    } catch {}
    return undefined
  }
}


