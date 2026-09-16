import path from 'node:path'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'
import { app } from 'electron'

// Resolves the Python interpreter used by tools/*.py.
// Prefers the embeddable runtime shipped with the app (resources/python), then falls back to PATH.

export function resourcesBase() {
  return app?.isPackaged ? process.resourcesPath : process.cwd()
}

export function toolPath(name) {
  return path.join(resourcesBase(), 'tools', name)
}

let bundledCache
export function bundledPython() {
  if (bundledCache !== undefined) return bundledCache
  const candidates = [
    path.join(resourcesBase(), 'python', 'python.exe'),
    path.join(process.cwd(), 'runtime', 'python', 'python.exe')
  ]
  bundledCache = candidates.find((p) => { try { return fsSync.existsSync(p) } catch { return false } }) || null
  return bundledCache
}

export function pythonCandidates() {
  const list = []
  const b = bundledPython()
  if (b) list.push(b)
  list.push('python', 'py', 'python3')
  return list
}

const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }

// Runs tools/<script> with args. Tries each interpreter until one launches and exits 0 (or produces output).
// Resolves { code, stdout, stderr, cmd } or null if no interpreter worked.
export function runPythonTool(script, args = [], opts = {}) {
  const scriptPath = path.isAbsolute(script) ? script : toolPath(script)
  const candidates = pythonCandidates()
  return new Promise((resolve) => {
    const tryNext = (i) => {
      if (i >= candidates.length) return resolve(null)
      const cmd = candidates[i]
      let p
      try {
        p = spawn(cmd, [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env })
      } catch { return tryNext(i + 1) }
      let stdout = ''
      let stderr = ''
      let handled = false
      let timer = null
      if (opts.timeoutMs) {
        timer = setTimeout(() => { try { p.kill() } catch {} }, opts.timeoutMs)
      }
      p.stdout.on('data', (d) => (stdout += d.toString()))
      p.stderr.on('data', (d) => (stderr += d.toString()))
      p.on('error', () => { if (handled) return; handled = true; if (timer) clearTimeout(timer); tryNext(i + 1) })
      p.on('close', (code) => {
        if (handled) return
        handled = true
        if (timer) clearTimeout(timer)
        // Windows Store python stub exits 9009 with no output; treat as "not installed".
        if (code !== 0 && !stdout) return tryNext(i + 1)
        resolve({ code, stdout, stderr, cmd })
      })
    }
    tryNext(0)
  })
}

// Convenience: run a tool and parse its JSON stdout. Returns null on any failure.
export async function runPythonJson(script, args = [], opts = {}) {
  const res = await runPythonTool(script, args, opts)
  if (!res || !res.stdout) return null
  try { return JSON.parse(res.stdout) } catch { return null }
}
