import path from 'node:path'

export class XboxDetector {
  constructor() { this.type = 'xbox' }

  async detect(_settings) {
    if (process.platform !== 'win32') return []
    try { console.log('[XboxDetector] Detect start (win32)') } catch {}
    const py = await this.tryPythonDetector()
    if (py && Array.isArray(py.games)) {
      try { console.log(`[XboxDetector] Python detector OK, games found: ${py.games.length}`) } catch {}
      return py.games.map((g) => ({ id: g.id, title: g.title, launcher: 'xbox', installDir: g.installDir, executablePath: g.executablePath || undefined, image: g.image, aumid: g.aumid }))
    }
    try { console.warn('[XboxDetector] Python detector returned no data; falling back to empty list') } catch {}
    return []
  }

  async tryPythonDetector() {
    try {
      const { spawn } = await import('node:child_process')
      const base = (await import('electron')).app?.isPackaged ? process.resourcesPath : process.cwd()
      const script = path.join(base, 'scripts', 'xbox_detect.py')
      try { console.log('[XboxDetector] Using script:', script) } catch {}
      const run = (cmd) => new Promise((resolve) => {
        try { console.log('[XboxDetector] Trying interpreter:', cmd) } catch {}
        const p = spawn(cmd, [script], { stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        let err = ''
        p.stdout.on('data', (d) => (out += d.toString()))
        p.stderr.on('data', (d) => (err += d.toString()))
        p.on('error', () => resolve(null))
        p.on('close', (code) => {
          try { console.log(`[XboxDetector] Interpreter ${cmd} exited with code`, code) } catch {}
          if (err) { try { console.warn('[XboxDetector] stderr:', err.slice(0, 400)) } catch {} }
          try { resolve(JSON.parse(out || '{}')) } catch (e) {
            try { console.warn('[XboxDetector] JSON parse failed; raw:', (out || '').slice(0, 400)) } catch {}
            resolve(null)
          }
        })
      })
      const res = (await run('python')) || (await run('py')) || (await run('python3'))
      if (!res) { try { console.warn('[XboxDetector] All interpreter attempts failed') } catch {} }
      return res
    } catch { return null }
  }
}


