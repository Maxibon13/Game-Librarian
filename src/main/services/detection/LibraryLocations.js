import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function registryValue(key, name) {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key, name ? '/v' : '/ve', ...(name ? [name] : [])], { windowsHide: true, timeout: 3000 })
    const value = /REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/i.exec(stdout)?.[1]?.trim()
    return value?.replace(/%([^%]+)%/g, (match, key) => process.env[key] || match) || null
  } catch { return null }
}

export async function existingDirectories(paths) {
  const found = new Map()
  for (const candidate of paths.filter(Boolean)) {
    try {
      const normalized = path.resolve(candidate)
      if ((await fs.stat(normalized)).isDirectory()) found.set(process.platform === 'win32' ? normalized.toLowerCase() : normalized, normalized)
    } catch {}
  }
  return [...found.values()]
}

export async function driveRoots() {
  if (process.platform !== 'win32') return []
  return existingDirectories([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `${letter}:\\`))
}

// Bounded discovery on all mounted drives, including non-default library names.
// Stop at steamapps so game assets are never traversed; ignore junctions and
// system/cache directories to avoid loops and expensive irrelevant trees.
export async function findSteamLibraries(roots, maxDepth = 4) {
  const libraries = []
  const visited = new Set()
  const ignored = /^(windows|programdata|appdata|\$recycle\.bin|system volume information|node_modules|\.git|windowsapps)$/i
  async function visit(root, depth) {
    const key = path.resolve(root).toLowerCase()
    if (visited.has(key)) return
    visited.add(key)
    if (path.basename(root).toLowerCase() === 'steamapps') { libraries.push(root); return }
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.isSymbolicLink() || ignored.test(ent.name)) continue
        const child = path.join(root, ent.name)
        if (ent.name.toLowerCase() === 'steamapps') libraries.push(child)
        else if (depth < maxDepth) await visit(child, depth + 1)
      }
    } catch {}
  }
  for (const root of await existingDirectories(roots)) await visit(root, 0)
  return existingDirectories(libraries)
}
