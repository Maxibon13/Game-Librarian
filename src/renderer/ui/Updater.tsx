import React, { useEffect, useState } from 'react'

type UpdateState =
  | { phase: 'checking' }
  | { phase: 'error'; message: string }
  | { phase: 'upToDate'; localVersion: string }
  | { phase: 'updateAvailable'; localVersion: string; remoteVersion: string; repository?: string }

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
          setState({ phase: 'updateAvailable', localVersion: res.localVersion, remoteVersion: res.remoteVersion, repository: res.repository })
          // For now, just proceed to app after brief delay
          setTimeout(async () => { await api.initBackend(); onReady() }, 800)
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

  return (
    <div className="updater-screen">
      <div className="updater-card">
        <div className="updater-title">Checking for new versions</div>
        <div className="updater-spinner" aria-label="Loading" />
        {state.phase === 'updateAvailable' && (
          <div className="updater-note">
            Update available: {state.localVersion} → {state.remoteVersion}
            {state.repository && (
              <>
                {' '}from <a href={state.repository} target="_blank" rel="noreferrer">repository</a>
              </>
            )}
          </div>
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


