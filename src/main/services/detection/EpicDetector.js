import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { existingDirectories, registryValue } from './LibraryLocations.js'

export class EpicDetector {
  async detect(settings) {
    try { console.log('[Detector:Epic]: Initialising') } catch {}
    const manifestDirs = await this.findManifestDirs(settings)
    const games = []
    for (const manifestDir of manifestDirs) {
      let files = []
      try { files = await fs.readdir(manifestDir) } catch { continue }
      for (const f of files) {
        if (!f.endsWith('.item') && !f.endsWith('.manifest')) continue
        try {
          const raw = await fs.readFile(path.join(manifestDir, f), 'utf8')
          const json = JSON.parse(raw)
          const id = json.AppName || json.CatalogItemId || json.InstallationGuid || f
          const title = json.DisplayName || json.AppName || 'Epic Game'
          const installDir = json.InstallLocation || json.InstallLocationWin64 || json.InstallLocationWin32
          const executablePath = installDir && json.LaunchExecutable ? path.resolve(installDir, json.LaunchExecutable) : undefined
          const image = [json.ImageUrl, json.MainGameAppImageUrl].find((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
          games.push({ id, title, launcher: 'epic', installDir, executablePath, image })
        } catch {}
      }
    }
    // Resolve Steam image fallbacks in parallel
    const results = await Promise.all(games.map(async (g) => {
      try {
        const image = g.image || await this.trySteamCommunityImage(g.title)
        return image ? { ...g, image } : g
      } catch {
        return g
      }
    }))
    try { console.log(`[Detector:Epic]: Found Libraries: ${JSON.stringify(manifestDirs)}`) } catch {}
    try { console.log(`[Detector:Epic]: Found Games : ${JSON.stringify(results.map(g=>({id:g.id,title:g.title})))}`) } catch {}
    try { console.log('[Detector:Epic]: Code ok') } catch {}
    return results
  }

  async findManifestDirs(settings) {
    const candidates = []
    const custom = settings?.epic?.manifestDir
    if (custom) candidates.push(custom, path.join(custom, 'Data', 'Manifests'), path.join(custom, 'Manifests'))
    if (os.platform() === 'win32') {
      for (const key of ['HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', 'HKLM\\SOFTWARE\\Epic Games\\EpicGamesLauncher', 'HKCU\\SOFTWARE\\Epic Games\\EpicGamesLauncher']) {
        const data = await registryValue(key, 'AppDataPath')
        if (data) candidates.push(path.join(data, 'Manifests'), path.join(data, 'Data', 'Manifests'))
      }
      candidates.push(path.join(process.env.ProgramData || 'C:/ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'))
    }
    return existingDirectories(candidates)
  }

  async trySteamCommunityImage(gameTitle) {
    // Runs tools/SteamApi_Search.py to resolve a Steam header image URL
    try {
      const { runPythonJson } = await import('../pythonRuntime.js')
      const parsed = await runPythonJson('SteamApi_Search.py', ['--game', gameTitle], { timeoutMs: 20000 })
      const url = parsed && parsed.imageUrl
      if (url && typeof url === 'string' && url.startsWith('http')) return url
    } catch {}
    return undefined
  }
}

