import fs from 'node:fs/promises'
import path from 'node:path'

async function ensureDirs() {
  const dirs = [
    'electron',
    'src/renderer/ui',
    'src/main/services/detection',
    'src/main/services/tracking',
    'scripts',
    'src/types'
  ]
  for (const d of dirs) {
    await fs.mkdir(path.resolve(d), { recursive: true })
  }
}

ensureDirs().catch(() => {})


