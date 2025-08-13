import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

export class EpicDetector {
  async detect(settings) {
    const manifestDir = await this.findManifestDir(settings)
    if (!manifestDir) return []
    let files = []
    try { files = await fs.readdir(manifestDir) } catch { return [] }
    const games = []
    for (const f of files) {
      if (!f.endsWith('.item') && !f.endsWith('.manifest')) continue
      try {
        const raw = await fs.readFile(path.join(manifestDir, f), 'utf8')
        const json = JSON.parse(raw)
        const id = json.AppName || json.CatalogItemId || json.InstallationGuid || f
        const title = json.DisplayName || json.AppName || 'Epic Game'
        const installDir = json.InstallLocation || json.InstallLocationWin64 || json.InstallLocationWin32
        // Try to attach a Steam community image as a fallback for Epic titles
        games.push({ id, title, launcher: 'epic', installDir })
      } catch {}
    }
    // Resolve Steam image fallbacks in parallel
    const results = await Promise.all(games.map(async (g) => {
      try {
        const image = await this.trySteamCommunityImage(g.title)
        return image ? { ...g, image } : g
      } catch {
        return g
      }
    }))
    return results
  }

  async findManifestDir(settings) {
    if (settings?.epic?.manifestDir) {
      try { await fs.access(settings.epic.manifestDir); return settings.epic.manifestDir } catch {}
    }
    if (os.platform() === 'win32') {
      const p = 'C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests'
      try { await fs.access(p); return p } catch {}
    }
    return null
  }

  async trySteamCommunityImage(gameTitle) {
    // Attempts to run scripts/SteamApi_Search.py to resolve an image URL
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


