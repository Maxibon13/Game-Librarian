import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function steamImages(steamPath, appId) {
  const images = []
  if (steamPath) {
    const cache = path.join(steamPath, 'appcache', 'librarycache')
    // Steam has both flat <appid>_*.jpg files and per-app directories with
    // optional hash suffixes. Only use artwork explicitly associated with this app.
    for (const [folder, prefix] of [[cache, `${appId}_`], [path.join(cache, appId), '']]) {
      try {
        const entries = await fs.readdir(folder, { withFileTypes: true })
        const files = entries.filter((e) => e.isFile() && e.name.startsWith(prefix) && /\.(jpg|jpeg|png|webp)$/i.test(e.name) && /(library_600x900|header|capsule)/i.test(e.name))
        files.sort((a, b) => Number(!/library_600x900/i.test(a.name)) - Number(!/library_600x900/i.test(b.name)) || a.name.localeCompare(b.name))
        images.push(...files.map((e) => pathToFileURL(path.join(folder, e.name)).href))
      } catch {}
    }
  }
  return images.sort((a, b) => Number(!/library_600x900/i.test(a)) - Number(!/library_600x900/i.test(b)))
}

const storeImages = new Map()
export async function steamStoreImages(appId) {
  if (!/^\d+$/.test(String(appId))) return []
  if (storeImages.has(appId)) return storeImages.get(appId)
  try {
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return []
    const payload = await response.json()
    const data = payload?.[appId]?.success && payload[appId].data
    // These URLs include content hashes for newer Steam releases.
    const images = [data?.header_image, data?.capsule_image].filter((url) => typeof url === 'string' && /^https:\/\//.test(url))
    if (images.length) storeImages.set(appId, images)
    return images
  } catch { return [] }
}
