import React, { useEffect, useState } from 'react'
import { ThemeSelect as AudioProfileSelect } from './ThemeSelect'
import DebugConsoleView from './DebugConsoleView'

function formatKeyCombo(e: React.KeyboardEvent<HTMLInputElement>) {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) parts.push(key)
  return parts.join('+')
}

type Props = {
  onSaved?: () => void
  audio?: { enabled: boolean; masterVolume: number }
  audioProfile?: 'normal' | 'alt'
  onAudioChange?: (next: { enabled: boolean; masterVolume: number }) => void
  onAudioProfileChange?: (profile: 'normal' | 'alt') => void
  hotkeys?: { [action: string]: string }
  onHotkeysChange?: (next: { [action: string]: string }) => void
}

type SettingsData = {
  steam: { steamPath: string; customLibraries: string[] }
  epic: { manifestDir: string }
  gog: { manifestDir: string; customLibraries: string[] }
  ubisoft: { manifestDir: string; customLibraries: string[] }
  theme?: { name: string }
}

export function Settings({ onSaved, audio, audioProfile: initialProfile = 'normal', onAudioChange, onAudioProfileChange, hotkeys, onHotkeysChange }: Props) {
  const [settings, setSettings] = useState<SettingsData>({
    steam: { steamPath: '', customLibraries: [] },
    epic: { manifestDir: '' },
    gog: { manifestDir: '', customLibraries: [] },
    ubisoft: { manifestDir: '', customLibraries: [] },
    theme: { name: 'dark' }
  })
  const [audioEnabled, setAudioEnabled] = useState<boolean>(audio?.enabled ?? true)
  const [masterVolume, setMasterVolume] = useState<number>(audio?.masterVolume ?? 1)
  const [audioProfile, setAudioProfile] = useState<'normal' | 'alt'>(initialProfile)
  useEffect(() => { setAudioProfile(initialProfile) }, [initialProfile])
  const [keys, setKeys] = useState<{ [action: string]: string }>(hotkeys || {})
  useEffect(() => { if (hotkeys) setKeys(hotkeys) }, [hotkeys])

  useEffect(() => {
    let mounted = true
    window.electronAPI.getSettings().then((s: any) => {
      if (!mounted) return
      setSettings((prev) => ({
        ...prev,
        ...(s || {}),
        gog: { manifestDir: '', customLibraries: [], ...((s && s.gog) || {}) },
        ubisoft: { manifestDir: '', customLibraries: [], ...((s && s.ubisoft) || {}) }
      }))
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  const update = (updater: (s: SettingsData) => SettingsData) => setSettings((s) => updater({ ...s }))

  async function save() {
    await window.electronAPI.saveSettings(settings)
    if (onAudioChange) onAudioChange({ enabled: audioEnabled, masterVolume })
    if (onAudioProfileChange && audioProfile) onAudioProfileChange(audioProfile)
    if (onHotkeysChange) onHotkeysChange(keys)
    onSaved?.()
  }

  async function pickDirectoryAndSet(updateFn: (path: string) => void) {
    const path = await window.electronAPI.pickDirectory()
    if (path) updateFn(path)
  }

  function addSteamLibrary() {
    update((s) => ({ ...s, steam: { ...s.steam, customLibraries: [...s.steam.customLibraries, ''] } }))
  }

  function changeSteamLibrary(idx: number, value: string) {
    update((s) => {
      const libs = s.steam.customLibraries.slice()
      libs[idx] = value
      return { ...s, steam: { ...s.steam, customLibraries: libs } }
    })
  }

  function removeSteamLibrary(idx: number) {
    update((s) => {
      const libs = s.steam.customLibraries.slice()
      libs.splice(idx, 1)
      return { ...s, steam: { ...s.steam, customLibraries: libs } }
    })
  }

  return (
    <div className="settings">
      <section>
        <h2>Audio</h2>
        <div className="toggle-row">
          <div className="toggle-label">Enable sounds</div>
          <button
            type="button"
            className={`switch ${audioEnabled ? 'on' : ''}`}
            role="switch"
            aria-checked={audioEnabled}
            onClick={() => {
              const next = !audioEnabled
              setAudioEnabled(next)
              onAudioChange?.({ enabled: next, masterVolume })
            }}
          >
            <span className="knob" />
          </button>
        </div>
        <label>
          Master volume: {Math.round(masterVolume * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => {
              const mv = parseFloat(e.target.value)
              setMasterVolume(mv)
              onAudioChange?.({ enabled: audioEnabled, masterVolume: mv })
            }}
          />
        </label>
        <div style={{ marginTop: 12 }}>
          <div className="toggle-label" style={{ marginBottom: 6 }}>Sound pack</div>
          <div style={{ display: 'inline-block' }}>
            <AudioProfileSelect
              value={audioProfile || 'normal'}
              onChange={(v) => { setAudioProfile(v); onAudioProfileChange?.(v) }}
              options={[
                { value: 'normal', label: 'Normal Sounds' },
                { value: 'alt', label: 'Alt Sounds' }
              ]}
            />
          </div>
        </div>
      </section>

      <section>
        <h2>Debug Console</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 12, opacity: .8, marginBottom: 6 }}>Real-time app logs</div>
            <div
              id="debug-console"
              style={{
                height: 220,
                overflowX: 'hidden',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
                lineHeight: 1.35
              }}
            >
              <DebugConsoleView />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-danger" onClick={async () => { try { await (window as any).debugConsoleAPI.clear() } catch {} }}>Clear buffer</button>
            <button className="btn" onClick={async () => {
              try {
                const res = await (window as any).electronAPI.exportLogsBundle()
                if (res && res.ok) alert(`Logs exported to: ${res.dir}`)
                else alert('Failed to export logs')
              } catch { alert('Failed to export logs') }
            }}>Export bundle</button>
          </div>
        </div>
      </section>

      <section>
        <h2>Global hotkeys</h2>
        <div style={{ fontSize: 12, opacity: .8, marginBottom: 8 }}>Click a field and press your shortcut.</div>
        {[
          { key: 'openApp', label: 'Open app' },
          { key: 'quickSearch', label: 'Quick search' }
        ].map((row) => (
          <label key={row.key}>
            {row.label}
            <input
              type="text"
              readOnly
              value={keys[row.key] || ''}
              placeholder="Not set"
              onKeyDown={(e) => {
                e.preventDefault()
                const combo = formatKeyCombo(e)
                const next = { ...keys, [row.key]: combo }
                setKeys(next)
                onHotkeysChange?.(next)
              }}
            />
          </label>
        ))}
      </section>
      <section>
        <h2>Steam</h2>
        <label>
          Steam folder (path to `Steam`):
          <input
            type="text"
            placeholder="C:\\Program Files (x86)\\Steam"
            value={settings.steam.steamPath}
            className="path-input browseable"
            onClick={() => pickDirectoryAndSet((p) => update((s) => ({ ...s, steam: { ...s.steam, steamPath: p } })))}
            onChange={(e) => update((s) => ({ ...s, steam: { ...s.steam, steamPath: e.target.value } }))}
          />
        </label>
        <div className="field-list">
          <div className="row">
            <div className="label">Steam libraries</div>
            <button className="btn" onClick={addSteamLibrary}>Add</button>
          </div>
          {settings.steam.customLibraries.map((p, i) => (
            <div className="row" key={i}>
              <input
                type="text"
                placeholder="D:\\SteamLibrary"
                value={p}
                className="path-input browseable"
                onClick={() => pickDirectoryAndSet((picked) => changeSteamLibrary(i, picked))}
                onChange={(e) => changeSteamLibrary(i, e.target.value)}
              />
              <button className="btn btn-danger" onClick={() => removeSteamLibrary(i)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Epic Games</h2>
        <label>
          Manifests folder:
          <input
            type="text"
            placeholder="C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests"
            value={settings.epic.manifestDir}
            className="path-input browseable"
            onClick={() => pickDirectoryAndSet((p) => update((s) => ({ ...s, epic: { ...s.epic, manifestDir: p } })))}
            onChange={(e) => update((s) => ({ ...s, epic: { ...s.epic, manifestDir: e.target.value } }))}
          />
        </label>
      </section>

      <section>
        <h2>GOG Galaxy</h2>
        <label>
          Manifests folder:
          <input
            type="text"
            placeholder="C:\\ProgramData\\GOG.com\\Galaxy\\storage\\galaxy-2.0.db (folder)"
            value={settings.gog?.manifestDir || ''}
            className="path-input browseable"
            onClick={() => pickDirectoryAndSet((p) => update((s) => ({ ...s, gog: { ...(s.gog || { manifestDir: '', customLibraries: [] }), manifestDir: p } })))}
            onChange={(e) => update((s) => ({ ...s, gog: { ...(s.gog || { manifestDir: '', customLibraries: [] }), manifestDir: e.target.value } }))}
          />
        </label>
        <div className="field-list">
          <div className="row">
            <div className="label">Additional game folders</div>
            <button className="btn" onClick={() => update((s) => ({ ...s, gog: { customLibraries: [...(s.gog?.customLibraries||[]), ''] } }))}>Add</button>
          </div>
          {(settings.gog?.customLibraries || []).map((p, i) => (
            <div className="row" key={i}>
              <input
                type="text"
                placeholder="D:\\GOG Games"
                value={p || ''}
                className="path-input browseable"
                onClick={() => pickDirectoryAndSet((picked) => update((s) => { const base = s.gog || { manifestDir: '', customLibraries: [] }; const list=[...base.customLibraries]; list[i]=picked; return { ...s, gog: { ...base, customLibraries: list } } }))}
                onChange={(e) => update((s) => { const base = s.gog || { manifestDir: '', customLibraries: [] }; const list=[...base.customLibraries]; list[i]=e.target.value; return { ...s, gog: { ...base, customLibraries: list } } })}
              />
              <button className="btn btn-danger" onClick={() => update((s) => { const base = s.gog || { manifestDir: '', customLibraries: [] }; const list=[...base.customLibraries]; list.splice(i,1); return { ...s, gog: { ...base, customLibraries: list } } })}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Ubisoft Connect</h2>
        <label>
          Manifests folder:
          <input
            type="text"
            placeholder="C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\data (folder)"
            value={settings.ubisoft?.manifestDir || ''}
            className="path-input browseable"
            onClick={() => pickDirectoryAndSet((p) => update((s) => ({ ...s, ubisoft: { ...(s.ubisoft || { manifestDir: '', customLibraries: [] }), manifestDir: p } })))}
            onChange={(e) => update((s) => ({ ...s, ubisoft: { ...(s.ubisoft || { manifestDir: '', customLibraries: [] }), manifestDir: e.target.value } }))}
          />
        </label>
        <div className="field-list">
          <div className="row">
            <div className="label">Additional game folders</div>
            <button className="btn" onClick={() => update((s) => ({ ...s, ubisoft: { customLibraries: [...(s.ubisoft?.customLibraries||[]), ''] } }))}>Add</button>
          </div>
          {(settings.ubisoft?.customLibraries || []).map((p, i) => (
            <div className="row" key={i}>
              <input
                type="text"
                placeholder="D:\\Ubisoft Games"
                value={p || ''}
                className="path-input browseable"
                onClick={() => pickDirectoryAndSet((picked) => update((s) => { const base = s.ubisoft || { manifestDir: '', customLibraries: [] }; const list=[...base.customLibraries]; list[i]=picked; return { ...s, ubisoft: { ...base, customLibraries: list } } }))}
                onChange={(e) => update((s) => { const base = s.ubisoft || { manifestDir: '', customLibraries: [] }; const list=[...base.customLibraries]; list[i]=e.target.value; return { ...s, ubisoft: { ...base, customLibraries: list } } })}
              />
              <button className="btn btn-danger" onClick={() => update((s) => { const base = s.ubisoft || { manifestDir: '', customLibraries: [] }; const list=[...base.customLibraries]; list.splice(i,1); return { ...s, ubisoft: { ...base, customLibraries: list } } })}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      {/* Theme section removed per request. Theme can be switched from the top bar dropdown. */}

      <section>
        <h2>Developer</h2>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Developer utilities are managed automatically in development builds.
        </div>
      </section>

      <div className="actions">
        <button className="btn btn-primary" onClick={save}>Save</button>
        <button className="btn btn-danger" onClick={async () => {
          const ok = confirm('Reset all playtime statistics? This cannot be undone.')
          if (!ok) return
          await (window as any).electronAPI.resetAllPlaytime()
          alert('Playtime statistics have been reset.')
        }}>Reset Playtime</button>
      </div>

      <section>
        <h2>Debug: Steam</h2>
        <div style={{display:'flex', gap:8}}>
          <button className="btn" onClick={async () => {
            const dbg = await (window as any).electronAPI.debugSteam()
            alert(JSON.stringify(dbg, null, 2))
          }}>Show Steam Debug Info</button>
        </div>
      </section>
    </div>
  )
}

// custom theme UI removed per request


