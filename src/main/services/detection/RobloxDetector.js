import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'

export class RobloxDetector {
  constructor() {
    this.type = 'roblox'
  }

  async detect(_settings) {
    if (os.platform() !== 'win32') return []
    const candidates = []
    const localAppData = process.env.LOCALAPPDATA
    const programFiles = process.env.ProgramFiles
    const programFilesX86 = process.env['ProgramFiles(x86)']

    // Standard Roblox Player path under LocalAppData
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Roblox', 'Versions'))
    }
    // Occasionally installed under Program Files
    if (programFiles) candidates.push(path.join(programFiles, 'Roblox', 'Versions'))
    if (programFilesX86) candidates.push(path.join(programFilesX86, 'Roblox', 'Versions'))

    const exes = []
    for (const base of candidates) {
      try {
        const versions = await fs.readdir(base, { withFileTypes: true })
        for (const ent of versions) {
          if (!ent.isDirectory()) continue
          const exe = path.join(base, ent.name, 'RobloxPlayerBeta.exe')
          try { if (fsSync.existsSync(exe)) exes.push(exe) } catch {}
        }
      } catch {}
    }

    const exe = exes[0]
    if (exe) {
      return [{ id: 'roblox-player', title: 'Roblox', launcher: 'roblox', executablePath: exe }]
    }
    return []
  }
}


