import { SteamDetector } from './SteamDetector.js'
import { EpicDetector } from './EpicDetector.js'
import { MinecraftDetector } from './MinecraftDetector.js'
import { RobloxDetector } from './RobloxDetector.js'

export class GameDetectionService {
  detectors = [new SteamDetector(), new EpicDetector(), new MinecraftDetector(), new RobloxDetector()]

  async detectAll(settings) {
    const detectors = this.detectors
    const results = []
    for (const d of detectors) {
      try {
        const r = await d.detect(settings)
        results.push(...r)
      } catch (e) {
        // ignore detector failures
      }
    }
    // de-duplicate by launcher:id
    const map = new Map()
    for (const g of results) {
      map.set(`${g.launcher}:${g.id}`, g)
    }
    return Array.from(map.values())
  }
}


