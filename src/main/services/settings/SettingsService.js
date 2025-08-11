import fs from 'node:fs/promises'
import path from 'node:path'

export class SettingsService {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'Userdata.Json')
    this.data = {
      steam: {
        steamPath: '',
        customLibraries: []
      },
      epic: {
        manifestDir: ''
      },
      // UI preferences persisted between sessions
      ui: {
        viewMode: 'large', // 'large' | 'small' | 'list'
        sort: 'az' // 'az' | 'za'
      },
      // Audio preferences
      audio: {
        enabled: true,
        masterVolume: 1.0
      },
      // Dev/debug options
      dev: {
        autoStartVite: false
      },
      // User overrides like custom game titles
      customTitles: {}
    }
  }

  async load() {
    try {
      const txt = await fs.readFile(this.filePath, 'utf8')
      const json = JSON.parse(txt)
      this.data = { ...this.data, ...json }
    } catch {}
    return this.data
  }

  async save(next) {
    this.data = { ...this.data, ...next }
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
    return this.data
  }

  get() { return this.data }

  async setCustomTitle(launcher, gameId, title) {
    const key = `${String(launcher)}:${String(gameId)}`
    const map = { ...(this.data.customTitles || {}) }
    if (String(title || '').trim().length === 0) {
      delete map[key]
    } else {
      map[key] = String(title)
    }
    this.data.customTitles = map
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
    return this.data
  }
}


