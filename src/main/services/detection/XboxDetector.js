import { runPythonTool, toolPath } from '../pythonRuntime.js'

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
      const script = toolPath('xbox_detect.py')
      try { console.log('[Detector:Xbox]: Using script:', script) } catch {}
      const res = await runPythonTool(script)
      if (!res) { try { console.warn('[Detector:Xbox]: No Python interpreter available') } catch {}; return null }
      try { console.log(`[Detector:Xbox]: Interpreter ${res.cmd} exited with code ${res.code}`) } catch {}
      if (res.stderr) { try { console.warn('[Detector:Xbox]: stderr:', res.stderr.slice(0, 400)) } catch {} }
      try { return JSON.parse(res.stdout || '{}') } catch {
        try { console.warn('[Detector:Xbox]: JSON parse failed; raw:', (res.stdout || '').slice(0, 400)) } catch {}
        return null
      }
    } catch { return null }
  }
}


