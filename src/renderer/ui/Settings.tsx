import React, { useEffect, useState } from 'react'

type Props = { onSaved?: () => void }

type SettingsData = {
  steam: { steamPath: string; customLibraries: string[] }
  epic: { manifestDir: string }
}

export function Settings({ onSaved }: Props) {
  const [settings, setSettings] = useState<SettingsData>({
    steam: { steamPath: '', customLibraries: [] },
    epic: { manifestDir: '' }
  })

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings)
  }, [])

  const update = (updater: (s: SettingsData) => SettingsData) => setSettings((s) => updater({ ...s }))

  async function save() {
    await window.electronAPI.saveSettings(settings)
    onSaved?.()
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
        <h2>Steam</h2>
        <label>
          Steam folder (path to `Steam`):
          <input
            type="text"
            placeholder="C:\\Program Files (x86)\\Steam"
            value={settings.steam.steamPath}
            onChange={(e) => update((s) => ({ ...s, steam: { ...s.steam, steamPath: e.target.value } }))}
          />
        </label>
        <div className="field-list">
          <div className="row">
            <div className="label">Steam libraries</div>
            <button onClick={addSteamLibrary}>Add</button>
          </div>
          {settings.steam.customLibraries.map((p, i) => (
            <div className="row" key={i}>
              <input
                type="text"
                placeholder="D:\\SteamLibrary"
                value={p}
                onChange={(e) => changeSteamLibrary(i, e.target.value)}
              />
              <button onClick={() => removeSteamLibrary(i)}>Remove</button>
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
            onChange={(e) => update((s) => ({ ...s, epic: { ...s.epic, manifestDir: e.target.value } }))}
          />
        </label>
      </section>

      <div className="actions">
        <button className="launch" onClick={save}>Save</button>
        <button onClick={async () => {
          const ok = confirm('Reset all playtime statistics? This cannot be undone.')
          if (!ok) return
          await (window as any).electronAPI.resetAllPlaytime()
          alert('Playtime statistics have been reset.')
        }}>Reset Playtime</button>
      </div>

      <section>
        <h2>Debug: Steam</h2>
        <div style={{display:'flex', gap:8}}>
          <button onClick={async () => {
            const dbg = await (window as any).electronAPI.debugSteam()
            alert(JSON.stringify(dbg, null, 2))
          }}>Show Steam Debug Info</button>
        </div>
      </section>
    </div>
  )
}


