import { SteamDetector } from './SteamDetector.js'
import { EpicDetector } from './EpicDetector.js'

export class GameDetectionService {
  detectors = [new SteamDetector(), new EpicDetector()]

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
    const list = Array.from(map.values())
    // Apply custom titles from settings
    try {
      const titles = settings && settings.customTitles ? settings.customTitles : {}
      if (titles && typeof titles === 'object') {
        for (const g of list) {
          const key = `${String(g.launcher)}:${String(g.id)}`
          if (titles[key]) g.title = String(titles[key])
        }
      }
    } catch {}
    return list
  }
}


