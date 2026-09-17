import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { steamStoreImages } from '../src/main/services/detection/SteamArtwork.js'

// Disk cache for remote cover art. Local file:// covers are returned untouched.
export class CoverCache {
  constructor(dir) {
    this.dir = dir
    this.mem = new Map()
    this.inflight = new Map()
    this.queue = []
    this.active = 0
    this.maxActive = 6
  }

  async init() {
    try { await fs.mkdir(this.dir, { recursive: true }) } catch {}
  }

  async resolve(url) {
    const src = String(url || '')
    if (!/^https?:/i.test(src)) return src
    if (this.mem.has(src)) return this.mem.get(src)
    const hash = crypto.createHash('sha1').update(src).digest('hex')
    const m = /\.(jpe?g|png|webp)(\?|$)/i.exec(src)
    const ext = (m ? m[1] : 'jpg').toLowerCase().replace('jpeg', 'jpg')
    const file = path.join(this.dir, `${hash}.${ext}`)
    if (fsSync.existsSync(file)) {
      const out = pathToFileURL(file).href
      this.mem.set(src, out)
      return out
    }
    if (this.inflight.has(src)) return this.inflight.get(src)
    const p = this.enqueue(() => this.download(src, file))
      .then((ok) => {
        const out = ok ? pathToFileURL(file).href : src
        if (ok) this.mem.set(src, out)
        return out
      })
      .finally(() => this.inflight.delete(src))
    this.inflight.set(src, p)
    return p
  }

  enqueue(task) {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve })
      this.pump()
    })
  }

  pump() {
    while (this.active < this.maxActive && this.queue.length > 0) {
      const { task, resolve } = this.queue.shift()
      this.active++
      Promise.resolve()
        .then(task)
        .catch(() => false)
        .then((r) => { this.active--; resolve(r); this.pump() })
    }
  }

  async download(url, file) {
    if (await this.downloadImage(url, file)) return true
    // New Steam releases may only expose hashed image URLs through store metadata.
    const steam = /^https:\/\/(?:steamcdn-a\.akamaihd\.net|cdn\.(?:akamai\.)?steamstatic\.com)\/steam\/apps\/(\d+)\//i.exec(url)
    if (steam) {
      for (const image of await steamStoreImages(steam[1])) {
        if (image !== url && await this.downloadImage(image, file)) return true
      }
    }
    return false
  }

  async downloadImage(url, file) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'GameLibrarian' } })
      if (!res.ok) return false
      const type = res.headers.get('content-type') || ''
      if (type && !type.startsWith('image/')) return false
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 64) return false
      const tmp = `${file}.tmp`
      await fs.writeFile(tmp, buf)
      await fs.rename(tmp, file)
      return true
    } catch {
      return false
    }
  }

  async clear() {
    this.mem.clear()
    try {
      const entries = await fs.readdir(this.dir)
      await Promise.all(entries.map((e) => fs.unlink(path.join(this.dir, e)).catch(() => {})))
    } catch {}
  }
}
