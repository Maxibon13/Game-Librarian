import fs from 'node:fs/promises'
import path from 'node:path'

export class FastloadService {
  constructor(userDataDir) {
    this.fastloadPath = path.join(userDataDir || process.cwd(), 'Fastload.json')
  }

  async saveGames(games) {
    try {
      const data = {
        games: games || [],
        timestamp: Date.now(),
        version: '1.0'
      }
      await fs.writeFile(this.fastloadPath, JSON.stringify(data, null, 2), 'utf8')
      console.log(`[Fastload] Saved ${games?.length || 0} games to cache`)
    } catch (error) {
      console.warn('[Fastload] Failed to save games:', error.message)
    }
  }

  async loadGames() {
    try {
      console.log(`[Fastload] Attempting to load from: ${this.fastloadPath}`)
      const raw = await fs.readFile(this.fastloadPath, 'utf8')
      const data = JSON.parse(raw)
      
      // Validate the data structure
      if (!data || !Array.isArray(data.games)) {
        console.warn('[Fastload] Invalid cache format, ignoring')
        return []
      }

      const age = Date.now() - (data.timestamp || 0)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      
      if (age > maxAge) {
        console.log(`[Fastload] Cache is ${Math.round(age / (60 * 60 * 1000))}h old, will refresh`)
        return []
      }

      console.log(`[Fastload] Loaded ${data.games.length} games from cache (${Math.round(age / (60 * 1000))}m old)`)
      return data.games
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[Fastload] Failed to load cache:', error.message)
      } else {
        console.log('[Fastload] No cache file found, will do full detection')
      }
      return []
    }
  }

  async clearCache() {
    try {
      await fs.unlink(this.fastloadPath)
      console.log('[Fastload] Cache cleared')
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[Fastload] Failed to clear cache:', error.message)
      }
    }
  }
}
