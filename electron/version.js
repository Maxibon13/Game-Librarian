const VERSION_FILE = 'Version.Json'
const UA = 'GameLibrarian-Updater'

export function versionFromPayload(data) {
  if (data == null) return ''
  if (typeof data === 'string' || typeof data === 'number') return String(data).trim()
  const v = data.version ?? data.Version ?? data.label
  return v == null ? '' : String(v).trim()
}

function channelRank(ch) {
  const c = String(ch || 'release').trim().toLowerCase()
  if (c === 'pre' || c === 'preview' || c === 'alpha' || c === 'dev') return 0
  if (c === 'beta' || c === 'rc') return 1
  return 2
}

function stampDate(raw) {
  const p = String(raw).padStart(6, '0')
  const dd = Number(p.slice(0, 2))
  const mm = Number(p.slice(2, 4))
  const yy = Number(p.slice(4, 6))
  return yy * 10000 + mm * 100 + dd
}

export function parseAppVersion(raw) {
  const s = String(raw ?? '').trim()
  const stamp = s.match(/^\(\s*(\d+)\.(\d+)\s*\)\s+(\d{5,6})\s*(?:-\s*(.+))?$/i)
  if (stamp) {
    return {
      kind: 'stamp',
      major: Number(stamp[1]),
      minor: Number(stamp[2]),
      date: stampDate(stamp[3]),
      channel: String(stamp[4] || 'Release').trim(),
      raw: s
    }
  }
  const n = Number.parseFloat(s)
  if (s !== '' && Number.isFinite(n)) return { kind: 'decimal', value: n, raw: s }
  return { kind: 'unknown', raw: s }
}

export function compareAppVersions(local, remote) {
  const a = parseAppVersion(local)
  const b = parseAppVersion(remote)
  if (a.kind === 'stamp' && b.kind === 'stamp') {
    if (a.major !== b.major) return a.major - b.major
    if (a.minor !== b.minor) return a.minor - b.minor
    if (a.date !== b.date) return a.date - b.date
    return channelRank(a.channel) - channelRank(b.channel)
  }
  if (a.kind === 'stamp' && b.kind !== 'stamp') return 1
  if (a.kind !== 'stamp' && b.kind === 'stamp') return -1
  if (a.kind === 'decimal' && b.kind === 'decimal') return a.value - b.value
  return 0
}

export function isUpdateAvailable(local, remote) {
  if (!remote) return false
  return compareAppVersions(local, remote) < 0
}

function parseVersionBody(body) {
  const text = String(body ?? '').trim()
  if (!text) return ''
  try {
    return versionFromPayload(JSON.parse(text))
  } catch {
    return versionFromPayload(text)
  }
}

async function fetchText(url, headers = {}) {
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 10000)
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache', ...headers },
      cache: 'no-store',
      signal: ac.signal
    })
    clearTimeout(t)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export function remoteVersionUrls(owner, repo) {
  const o = encodeURIComponent(owner)
  const r = encodeURIComponent(repo)
  return [
    `https://raw.githubusercontent.com/${o}/${r}/main/${VERSION_FILE}`,
    `https://raw.githubusercontent.com/${o}/${r}/master/${VERSION_FILE}`,
    `https://github.com/${o}/${r}/raw/main/${VERSION_FILE}`,
    `https://api.github.com/repos/${o}/${r}/contents/${VERSION_FILE}?ref=main`
  ]
}

export async function fetchRemoteVersion(owner, repo) {
  const urls = remoteVersionUrls(owner, repo)
  for (const url of urls) {
    const api = url.includes('api.github.com')
    const body = await fetchText(url, api
      ? { Accept: 'application/vnd.github.raw+json' }
      : { Accept: 'application/json' })
    const v = parseVersionBody(body)
    if (v) return v
    if (api && body) {
      try {
        const json = JSON.parse(body)
        if (json?.content && json?.encoding === 'base64') {
          const decoded = Buffer.from(json.content.replace(/\s/g, ''), 'base64').toString('utf8')
          const fromB64 = parseVersionBody(decoded)
          if (fromB64) return fromB64
        }
      } catch {}
    }
  }
  return null
}
