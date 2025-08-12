import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'

export class GOGDetector {
  constructor() {
    this.type = 'gog'
  }

  async detect(settings) {
    if (process.platform !== 'win32') return []
    const games = []
    try {
      // Query 32-bit registry hive where GOG stores game entries
      const { stdout } = spawnSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games'], { encoding: 'utf8' })
      const subkeys = (stdout || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('HKEY'))
      for (const key of subkeys) {
        try {
          const q = spawnSync('reg', ['query', key], { encoding: 'utf8' })
          const text = q.stdout || ''
          const nameMatch = /\sDisplayName\s+REG_SZ\s+(.+)/i.exec(text)
          const pathMatch = /\spath\s+REG_SZ\s+(.+)/i.exec(text) || /\sInstallPath\s+REG_SZ\s+(.+)/i.exec(text)
          const idMatch = /\\Games\\([^\\\r\n]+)$/i.exec(key)
          const title = (nameMatch?.[1] || idMatch?.[1] || '').trim()
          const installDir = (pathMatch?.[1] || '').trim()
          if (!title || !installDir) continue
          try { await fs.access(installDir) } catch { continue }
          games.push({ id: idMatch?.[1] || title, title, launcher: 'gog', installDir })
        } catch {}
      }
    } catch {}
    // Also scan user-provided custom libraries for executables as a fallback
    try {
      const { default: fg } = await import('fast-glob')
      const libs = settings?.gog?.customLibraries || []
      for (const root of libs) {
        try {
          const candidates = await fg(['**/*.exe'], { cwd: root, absolute: true, deep: 3, suppressErrors: true })
          for (const exe of candidates) {
            const title = path.basename(exe, '.exe')
            games.push({ id: title, title, launcher: 'gog', installDir: path.dirname(exe), executablePath: exe })
          }
        } catch {}
      }
    } catch {}
    return games
  }
}


