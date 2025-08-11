import React, { useEffect, useState } from 'react'

type Props = {
  onSaved?: () => void
  audio?: { enabled: boolean; masterVolume: number }
  onAudioChange?: (next: { enabled: boolean; masterVolume: number }) => void
}

type SettingsData = {
  steam: { steamPath: string; customLibraries: string[] }
  epic: { manifestDir: string }
}

export function Settings({ onSaved, audio, onAudioChange }: Props) {
  const [settings, setSettings] = useState<SettingsData>({
    steam: { steamPath: '', customLibraries: [] },
    epic: { manifestDir: '' }
  })
  const [audioEnabled, setAudioEnabled] = useState<boolean>(audio?.enabled ?? true)
  const [masterVolume, setMasterVolume] = useState<number>(audio?.masterVolume ?? 1)

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings)
  }, [])

  const update = (updater: (s: SettingsData) => SettingsData) => setSettings((s) => updater({ ...s }))

  async function save() {
    await window.electronAPI.saveSettings(settings)
    if (onAudioChange) onAudioChange({ enabled: audioEnabled, masterVolume })
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
            onClick={() => setAudioEnabled((v) => !v)}
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
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
          />
        </label>
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => onAudioChange?.({ enabled: audioEnabled, masterVolume })}>Apply</button>
        </div>
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


