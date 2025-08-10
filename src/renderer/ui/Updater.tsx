import React, { useEffect, useState } from 'react'

type UpdateState =
  | { phase: 'checking' }
  | { phase: 'error'; message: string }
  | { phase: 'upToDate'; localVersion: string }
  | { phase: 'prompt'; localVersion: string; remoteVersion: string; repository?: string }

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
          setState({ phase: 'prompt', localVersion: res.localVersion, remoteVersion: res.remoteVersion, repository: res.repository })
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
        {state.phase === 'checking' && <div className="updater-spinner" aria-label="Loading" />}
        {state.phase === 'prompt' && (
          <>
            <div className="updater-note">A new version is available: {state.localVersion} → {state.remoteVersion}.</div>
            {state.repository && (
              <div className="updater-note">Source: <a href={state.repository} target="_blank" rel="noreferrer">repository</a></div>
            )}
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
              <button className="btn" style={{ padding: '4px 8px' }} onClick={async () => {
                try {
                  const info = await (window as any).electronAPI.debugVersion()
                  alert('Version source: ' + (info?.method || 'unknown') + '\nPath: ' + (info?.path || '(none)') + '\nVersion: ' + (info?.version || 'n/a'))
                } catch (e) {
                  alert('Failed to get version debug info: ' + (e as any)?.message)
                }
              }}>Debug version source</button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  const res = await (window as any).electronAPI.installUpdateAndExit()
                  if (!res?.ok) {
                    const msg = res?.error ? String(res.error) : 'Unknown error'
                    alert('Failed to start installer. ' + msg + '\nYou can run scripts/InstallerLite.bat manually.')
                  }
                } catch (e) {
                  alert('Failed to start installer: ' + (e as any)?.message)
                }
              }}>Install and restart</button>
              <button className="btn" onClick={async () => {
                // Skip update and continue
                try { await (window as any).electronAPI.initBackend() } catch {}
                onReady()
              }}>Skip for now</button>
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


