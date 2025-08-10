import React, { useEffect, useState } from 'react'

type UpdateState =
  | { phase: 'checking' }
  | { phase: 'error'; message: string }
  | { phase: 'upToDate'; localVersion: string }
  | { phase: 'updateAvailable'; localVersion: string; remoteVersion: string; repository?: string }
  | { phase: 'installing'; localVersion: string; remoteVersion: string }

export function Updater({ onReady }: { onReady: () => void }) {
  const [state, setState] = useState<UpdateState>({ phase: 'checking' })
  const [appName, setAppName] = useState<string>('Game Librarian')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const api = (window as any).electronAPI
        const cfg = await api.getAppConfig()
        if (cfg?.appName || cfg?.AppName) setAppName(cfg.appName || cfg.AppName)
        const res = await api.checkForUpdate()
        if (cancelled) return
        if (!res?.ok) {
          setState({ phase: 'error', message: res?.error || 'failed to check' })
          // proceed anyway
          await api.initBackend()
          onReady()
          return
        }
        if (res.updateAvailable) {
          setState({ phase: 'installing', localVersion: res.localVersion, remoteVersion: res.remoteVersion })
          // Show installing page with live logs
          try {
            await api.runUpdaterWithLogs()
          } catch {}
          // After updater completes, continue startup
          setTimeout(async () => { await api.initBackend(); onReady() }, 600)
        } else {
          setState({ phase: 'upToDate', localVersion: res.localVersion })
          await api.initBackend()
          onReady()
        }
      } catch (e: any) {
        setState({ phase: 'error', message: String(e?.message || e) })
        try { await (window as any).electronAPI.initBackend() } catch {}
        onReady()
      }
    })()
    return () => { cancelled = true }
  }, [onReady])

  const [logs, setLogs] = React.useState<string[]>([])
  const [progress, setProgress] = React.useState<number>(0)

  React.useEffect(() => {
    const api: any = (window as any).electronAPI
    const onLog = (line: string) => {
      setLogs((prev) => [...prev, line])
      // Heuristic progress bumps for user feedback
      const l = line.toLowerCase()
      if (l.includes('fetch') || l.includes('clon')) setProgress((p) => Math.max(p, 20))
      if (l.includes('checkout') || l.includes('pull')) setProgress((p) => Math.max(p, 50))
      if (l.includes('reset') || l.includes('synchronized')) setProgress((p) => Math.max(p, 75))
      if (l.includes('done') || l.includes('complete')) setProgress((p) => Math.max(p, 95))
    }
    const onDone = (_payload: string) => setProgress(100)
    api?.onUpdaterLog?.(onLog)
    api?.onUpdaterDone?.(onDone)
    return () => {
      try { api?.onUpdaterLog?.(() => {}) } catch {}
    }
  }, [])

  return (
    <div className="updater-screen">
      <div className="updater-card">
        <div className="updater-title">
          {state.phase === 'installing' ? 'Installing update' : 'Checking for new versions'}
        </div>
        {state.phase !== 'installing' && <div className="updater-spinner" aria-label="Loading" />}
        {state.phase === 'installing' && (
          <>
            <div className="updater-note">Updating {state.localVersion} → {state.remoteVersion}</div>
            <div className="progress-bar" aria-label="Progress">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="updater-console" role="log" aria-live="polite">
              {logs.map((l, i) => (
                <div key={i} className="console-line">{l}</div>
              ))}
            </div>
          </>
        )}
        {state.phase === 'upToDate' && (
          <div className="updater-note">You are up to date (v{state.localVersion}).</div>
        )}
        {state.phase === 'error' && (
          <div className="updater-note" style={{ color: '#ff9e9e' }}>Update check failed: {state.message}</div>
        )}
      </div>
    </div>
  )
}


