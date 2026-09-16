import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { runPythonJson } from '../pythonRuntime.js'

export class EpicDetector {
  async detect(settings) {
    try { console.log('[Detector:Epic]: Initialising') } catch {}
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
    try { console.log(`[Detector:Epic]: Found Library at "${manifestDir}"`) } catch {}
    try { console.log(`[Detector:Epic]: Found Games : ${JSON.stringify(results.map(g=>({id:g.id,title:g.title})))}`) } catch {}
    try { console.log('[Detector:Epic]: Code ok') } catch {}
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
    // Runs tools/SteamApi_Search.py to resolve a Steam header image URL
    try {
      const parsed = await runPythonJson('SteamApi_Search.py', ['--game', gameTitle], { timeoutMs: 20000 })
      const url = parsed && parsed.imageUrl
      if (url && typeof url === 'string' && url.startsWith('http')) return url
    } catch {}
    return undefined
  }
}


