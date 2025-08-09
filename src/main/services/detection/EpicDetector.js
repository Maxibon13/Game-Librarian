import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

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
        // Epic images require EGS catalog calls; fallback to no image here, renderer will show gradient
        games.push({ id, title, launcher: 'epic', installDir })
      } catch {}
    }
    return games
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
}


