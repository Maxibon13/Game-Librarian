import fs from 'node:fs/promises'
import path from 'node:path'

export class SettingsService {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'settings.json')
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
      }
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
}


