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
      gog: {
        manifestDir: '',
        customLibraries: []
      },
      ubisoft: {
        manifestDir: '',
        customLibraries: []
      },
      // Theme preferences (preset themes only)
      theme: {
        name: 'dark' // See App.tsx for available presets
      },
      // Onboarding / first-run flags
      welcomeSeen: false,
      // UI preferences persisted between sessions
      ui: {
        viewMode: 'grid', // 'grid' | 'compact' | 'list'
        sort: 'az', // 'az' | 'za' | 'playtime-desc' | 'playtime-asc' | 'recent'
        mica: true,
        fullscreenOnGamepad: false,
        sessionFocusMode: false,
        reduceMotion: false
      },
      // Audio preferences
      audio: {
        enabled: true,
        masterVolume: 1.0,
        profile: 'normal' // 'normal' | 'alt'
      },
      // Global hotkeys, e.g. { openApp: 'Ctrl+Shift+G', quickSearch: 'Ctrl+Shift+F' }
      hotkeys: {},
      // Windows shell integration toggles
      windows: {
        closeToTray: false,
        notifications: true
      },
      // Per-game renamed titles keyed by "launcher:id"
      customTitles: {}
    }
  }

  async load() {
    try {
      const txt = await fs.readFile(this.filePath, 'utf8')
      const json = JSON.parse(txt)
      const merged = { ...this.data, ...json }
      // One-level deep merge so new default keys survive older settings files
      for (const k of Object.keys(this.data)) {
        const d = this.data[k]
        const j = json?.[k]
        if (d && typeof d === 'object' && !Array.isArray(d) && j && typeof j === 'object' && !Array.isArray(j)) {
          merged[k] = { ...d, ...j }
        }
      }
      this.data = merged
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


