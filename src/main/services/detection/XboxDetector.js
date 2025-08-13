import path from 'node:path'

export class XboxDetector {
  constructor() { this.type = 'xbox' }

  async detect(_settings) {
    if (process.platform !== 'win32') return []
    try { console.log('[Detector:Xbox]: Initialising') } catch {}
    const py = await this.tryPythonDetector()
    if (py && Array.isArray(py.games)) {
      try { console.log(`[Detector:Xbox]: Found Library at "C:/XboxGames"`) } catch {}
      try { console.log(`[Detector:Xbox]: Found Games : ${JSON.stringify(py.games.map(g=>({id:g.id,title:g.title})))}`) } catch {}
      try { console.log('[Detector:Xbox]: Code ok') } catch {}
      return py.games.map((g) => ({ id: g.id, title: g.title, launcher: 'xbox', installDir: g.installDir, executablePath: g.executablePath || undefined, image: g.image, aumid: g.aumid }))
    }
    try { console.warn('[Detector:Xbox]: No games found') } catch {}
    return []
  }

  async tryPythonDetector() {
    try {
      const { spawn } = await import('node:child_process')
      const base = (await import('electron')).app?.isPackaged ? process.resourcesPath : process.cwd()
      const script = path.join(base, 'scripts', 'xbox_detect.py')
      try { console.log('[Detector:Xbox]: Using script:', script) } catch {}
      const run = (cmd) => new Promise((resolve) => {
        try { console.log('[Detector:Xbox]: Trying interpreter:', cmd) } catch {}
        const p = spawn(cmd, [script], { stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        let err = ''
        p.stdout.on('data', (d) => (out += d.toString()))
        p.stderr.on('data', (d) => (err += d.toString()))
        p.on('error', () => resolve(null))
        p.on('close', (code) => {
          try { console.log(`[Detector:Xbox]: Interpreter ${cmd} exited with code ${code}`) } catch {}
          if (err) { try { console.warn('[Detector:Xbox]: stderr:', err.slice(0, 400)) } catch {} }
          try { resolve(JSON.parse(out || '{}')) } catch (e) {
            try { console.warn('[Detector:Xbox]: JSON parse failed; raw:', (out || '').slice(0, 400)) } catch {}
            resolve(null)
          }
        })
      })
      const res = (await run('python')) || (await run('py')) || (await run('python3'))
      if (!res) { try { console.warn('[Detector:Xbox]: All interpreter attempts failed') } catch {} }
      return res
    } catch { return null }
  }
}


