import { SteamDetector } from './SteamDetector.js'
import { EpicDetector } from './EpicDetector.js'
import { RobloxDetector } from './RobloxDetector.js'
import { GOGDetector } from './GOGDetector.js'
import { UbisoftDetector } from './UbisoftDetector.js'
import { XboxDetector } from './XboxDetector.js'

export class GameDetectionService {
  constructor(resolveIcon = async () => undefined) {
    this.resolveIcon = resolveIcon
  }
  detectors = [new SteamDetector(), new EpicDetector(), new GOGDetector(), new UbisoftDetector(), new XboxDetector(), new RobloxDetector()]

  async detectAll(settings) {
    const detectors = this.detectors
    const results = []
    for (const d of detectors) {
      try {
        const r = await d.detect(settings)
        results.push(...r)
      } catch (e) {
        console.warn(`[Detection] ${d.type || d.constructor.name} failed:`, e)
      }
    }
    // de-duplicate by launcher:id
    const map = new Map()
    for (const g of results) {
      map.set(`${g.launcher}:${g.id}`, g)
    }
    const games = Array.from(map.values())
    // Executable icons are a local fallback, including Roblox and delisted games.
    for (const game of games) {
      if (!game.executablePath) continue
      try { game.icon = await this.resolveIcon(game.executablePath) } catch {}
    }
    return games
  }
}

