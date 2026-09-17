import React from 'react'
import type { AudioProfile, Settings, ViewMode, WindowChrome } from '../lib/types'
import { api } from '../lib/api'
import { THEMES } from '../lib/theme'
import { Select } from '../components/Select'
import DebugConsoleView from '../ui/DebugConsoleView'
import { IconFolder } from '../components/Icons'

export type SettingsSection = 'appearance' | 'library' | 'audio' | 'hotkeys' | 'windows' | 'advanced' | 'about'

type Props = {
  settings: Settings
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onPatch: (patch: Partial<Settings>) => Promise<void>
  onRescan: () => void
  appVersion: string | null
  chrome: WindowChrome | null
  onOpenChangelog: () => void
  onToast: (text: string) => void
}

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'library', label: 'Library paths' },
  { id: 'audio', label: 'Audio' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'windows', label: 'Windows' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'about', label: 'About' }
]

export function SettingsView({ settings, section, onSectionChange, onPatch, onRescan, appVersion, chrome, onOpenChangelog, onToast }: Props) {
  return (
    <div className="view view-settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s, i) => (
          <button key={s.id} className={`settings-nav-item ${section === s.id ? 'is-active' : ''}`} data-nav {...(section === s.id ? { 'data-nav-default': true } : {})} onClick={() => onSectionChange(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="settings-panel">
        {section === 'appearance' && <Appearance settings={settings} onPatch={onPatch} chrome={chrome} />}
        {section === 'library' && <LibraryPaths settings={settings} onPatch={onPatch} onRescan={onRescan} onToast={onToast} />}
        {section === 'audio' && <AudioSection settings={settings} onPatch={onPatch} />}
        {section === 'hotkeys' && <Hotkeys settings={settings} onPatch={onPatch} />}
        {section === 'windows' && <WindowsSection settings={settings} onPatch={onPatch} chrome={chrome} />}
        {section === 'advanced' && <Advanced onToast={onToast} onRescan={onRescan} />}
        {section === 'about' && <About appVersion={appVersion} onOpenChangelog={onOpenChangelog} />}
      </div>
    </div>
  )
}

/* ---------- shared controls ---------- */

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} data-nav onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  )
}

function PathField({ value, placeholder, onChange, onRemove }: { value: string; placeholder: string; onChange: (v: string) => void; onRemove?: () => void }) {
  return (
    <div className="path-field">
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      <button className="icon-btn" data-nav title="Browse" onClick={async () => { const p = await api.pickDirectory(); if (p) onChange(p) }}><IconFolder size={18} /></button>
      {onRemove && <button className="btn btn-ghost btn-sm" data-nav onClick={onRemove}>Remove</button>}
    </div>
  )
}

/* ---------- sections ---------- */

function Appearance({ settings, onPatch, chrome }: { settings: Settings; onPatch: Props['onPatch']; chrome: WindowChrome | null }) {
  const ui = settings.ui || ({} as Settings['ui'])
  const viewMode: ViewMode = ui.viewMode === 'large' ? 'grid' : ui.viewMode === 'small' ? 'compact' : (ui.viewMode as ViewMode) || 'grid'
  return (
    <section>
      <h2>Appearance</h2>
      <Row label="Theme" hint="Accent packs on a Fluent dark or light shell.">
        <Select
          value={settings.theme?.name || 'dark'}
          options={THEMES.map((t) => ({ value: t.name, label: t.label, swatch: t.accent }))}
          onChange={(name) => void onPatch({ theme: { name } })}
          ariaLabel="Theme"
        />
      </Row>
      <Row label="Default library view">
        <Select
          value={viewMode}
          options={[{ value: 'grid', label: 'Covers' }, { value: 'compact', label: 'Compact covers' }, { value: 'list', label: 'List' }]}
          onChange={(v) => void onPatch({ ui: { ...ui, viewMode: v as ViewMode } })}
          ariaLabel="Default view"
        />
      </Row>
      {chrome?.micaSupported && (
        <Row label="Mica window background" hint="Windows 11 material behind the shell. Takes effect on next launch.">
          <Toggle on={ui.mica !== false} label="Mica" onChange={(v) => void onPatch({ ui: { ...ui, mica: v } })} />
        </Row>
      )}
      <Row label="Fullscreen when a controller connects" hint="Big Picture behaviour: go fullscreen on gamepad connect.">
        <Toggle on={!!ui.fullscreenOnGamepad} label="Fullscreen on gamepad" onChange={(v) => void onPatch({ ui: { ...ui, fullscreenOnGamepad: v } })} />
      </Row>
      <Row label="Session focus mode" hint="Show a full-screen overlay while a game runs instead of the compact dock.">
        <Toggle on={!!ui.sessionFocusMode} label="Focus mode" onChange={(v) => void onPatch({ ui: { ...ui, sessionFocusMode: v } })} />
      </Row>
      <Row label="Reduce motion">
        <Toggle on={!!ui.reduceMotion} label="Reduce motion" onChange={(v) => void onPatch({ ui: { ...ui, reduceMotion: v } })} />
      </Row>
    </section>
  )
}

function LibraryPaths({ settings, onPatch, onRescan, onToast }: { settings: Settings; onPatch: Props['onPatch']; onRescan: () => void; onToast: (t: string) => void }) {
  const [draft, setDraft] = React.useState(() => snapshot(settings))
  const [dirty, setDirty] = React.useState(false)
  React.useEffect(() => { if (!dirty) setDraft(snapshot(settings)) }, [settings, dirty])

  const upd = (fn: (d: ReturnType<typeof snapshot>) => ReturnType<typeof snapshot>) => { setDraft((d) => fn({ ...d })); setDirty(true) }
  const listField = (key: 'steam' | 'gog' | 'ubisoft', title: string, placeholder: string) => (
    <div className="field-list">
      <div className="field-list-head">
        <span>{title}</span>
        <button className="btn btn-ghost btn-sm" data-nav onClick={() => upd((d) => ({ ...d, [key]: { ...d[key], customLibraries: [...d[key].customLibraries, ''] } }))}>Add folder</button>
      </div>
      {draft[key].customLibraries.map((p, i) => (
        <PathField
          key={i}
          value={p}
          placeholder={placeholder}
          onChange={(v) => upd((d) => { const list = d[key].customLibraries.slice(); list[i] = v; return { ...d, [key]: { ...d[key], customLibraries: list } } })}
          onRemove={() => upd((d) => { const list = d[key].customLibraries.slice(); list.splice(i, 1); return { ...d, [key]: { ...d[key], customLibraries: list } } })}
        />
      ))}
    </div>
  )

  async function save() {
    await onPatch({ steam: draft.steam, epic: draft.epic, gog: draft.gog, ubisoft: draft.ubisoft })
    setDirty(false)
    onToast('Paths saved · rescanning')
    onRescan()
  }

  return (
    <section>
      <h2>Library paths</h2>
      <p className="section-lead">Launcher locations are detected automatically from installed launchers and library records. Steam also scans connected drives for libraries. Add a folder below if a location is missing.</p>
      <h3>Steam</h3>
      <PathField value={draft.steam.steamPath} placeholder="C:\Program Files (x86)\Steam" onChange={(v) => upd((d) => ({ ...d, steam: { ...d.steam, steamPath: v } }))} />
      {listField('steam', 'Additional Steam libraries', 'D:\\SteamLibrary')}
      <h3>Epic Games</h3>
      <PathField value={draft.epic.manifestDir} placeholder="C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests" onChange={(v) => upd((d) => ({ ...d, epic: { manifestDir: v } }))} />
      <h3>GOG Galaxy</h3>
      <PathField value={draft.gog.manifestDir} placeholder="C:\ProgramData\GOG.com\Galaxy\storage" onChange={(v) => upd((d) => ({ ...d, gog: { ...d.gog, manifestDir: v } }))} />
      {listField('gog', 'Additional GOG game folders', 'D:\\GOG Games')}
      <h3>Ubisoft Connect</h3>
      <PathField value={draft.ubisoft.manifestDir} placeholder="C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\data" onChange={(v) => upd((d) => ({ ...d, ubisoft: { ...d.ubisoft, manifestDir: v } }))} />
      {listField('ubisoft', 'Additional Ubisoft game folders', 'D:\\Ubisoft Games')}
      <div className="section-actions">
        <button className="btn btn-accent" data-nav disabled={!dirty} onClick={save}>Save and rescan</button>
        <button className="btn btn-ghost" data-nav disabled={!dirty} onClick={() => { setDraft(snapshot(settings)); setDirty(false) }}>Discard</button>
      </div>
    </section>
  )
}

function snapshot(s: Settings) {
  return {
    steam: { steamPath: s.steam?.steamPath || '', customLibraries: Array.isArray(s.steam?.customLibraries) ? s.steam.customLibraries.slice() : [] },
    epic: { manifestDir: s.epic?.manifestDir || '' },
    gog: { manifestDir: s.gog?.manifestDir || '', customLibraries: Array.isArray(s.gog?.customLibraries) ? s.gog.customLibraries.slice() : [] },
    ubisoft: { manifestDir: s.ubisoft?.manifestDir || '', customLibraries: Array.isArray(s.ubisoft?.customLibraries) ? s.ubisoft.customLibraries.slice() : [] }
  }
}

function AudioSection({ settings, onPatch }: { settings: Settings; onPatch: Props['onPatch'] }) {
  const audio = settings.audio || { enabled: true, masterVolume: 1, profile: 'normal' as AudioProfile }
  const [vol, setVol] = React.useState(audio.masterVolume)
  React.useEffect(() => { setVol(audio.masterVolume) }, [audio.masterVolume])
  return (
    <section>
      <h2>Audio</h2>
      <Row label="UI sounds">
        <Toggle on={audio.enabled !== false} label="UI sounds" onChange={(v) => void onPatch({ audio: { ...audio, enabled: v } })} />
      </Row>
      <Row label={`Volume · ${Math.round(vol * 100)}%`}>
        <input
          type="range" min={0} max={1} step={0.01} value={vol} data-nav aria-label="Master volume"
          onChange={(e) => setVol(parseFloat(e.target.value))}
          onMouseUp={() => void onPatch({ audio: { ...audio, masterVolume: vol } })}
          onKeyUp={() => void onPatch({ audio: { ...audio, masterVolume: vol } })}
          onTouchEnd={() => void onPatch({ audio: { ...audio, masterVolume: vol } })}
        />
      </Row>
      <Row label="Sound pack">
        <Select
          value={audio.profile || 'normal'}
          options={[{ value: 'normal', label: 'Standard' }, { value: 'alt', label: 'Alternate' }]}
          onChange={(v) => void onPatch({ audio: { ...audio, profile: v as AudioProfile } })}
          ariaLabel="Sound pack"
        />
      </Row>
    </section>
  )
}

function formatKeyCombo(e: React.KeyboardEvent<HTMLInputElement>) {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) parts.push(key)
  return parts
}

function Hotkeys({ settings, onPatch }: { settings: Settings; onPatch: Props['onPatch'] }) {
  const keys = settings.hotkeys || {}
  const rows = [
    { key: 'openApp', label: 'Show Game Librarian', hint: 'Brings the window to the front from anywhere.' },
    { key: 'quickSearch', label: 'Quick search', hint: 'Shows the window and focuses library search.' }
  ]
  const set = (k: string, v: string) => void onPatch({ hotkeys: { ...keys, [k]: v } })
  return (
    <section>
      <h2>Global hotkeys</h2>
      <p className="section-lead">Click a field and press a combination. Hotkeys need at least one modifier. Backspace clears.</p>
      {rows.map((r) => (
        <Row key={r.key} label={r.label} hint={r.hint}>
          <div className="hotkey-field">
            <input
              type="text" readOnly value={keys[r.key] || ''} placeholder="Not set" aria-label={r.label}
              onKeyDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.key === 'Backspace' || e.key === 'Delete') { set(r.key, ''); return }
                if (e.key === 'Escape' || e.key === 'Tab') { (e.target as HTMLInputElement).blur(); return }
                const parts = formatKeyCombo(e)
                const hasMod = parts.some((p) => ['Ctrl', 'Shift', 'Alt'].includes(p))
                const hasKey = parts.some((p) => !['Ctrl', 'Shift', 'Alt'].includes(p))
                if (hasMod && hasKey) set(r.key, parts.join('+'))
              }}
            />
          </div>
        </Row>
      ))}
    </section>
  )
}

function WindowsSection({ settings, onPatch, chrome }: { settings: Settings; onPatch: Props['onPatch']; chrome: WindowChrome | null }) {
  const w = settings.windows || {}
  const isWin = chrome?.platform === 'win32'
  return (
    <section>
      <h2>Windows integration</h2>
      {!isWin && <p className="section-lead">These options apply on Windows.</p>}
      <Row label="Close to tray" hint="Keep tracking sessions with the window hidden. Reopen from the tray icon or your hotkey.">
        <Toggle on={!!w.closeToTray} label="Close to tray" onChange={(v) => void onPatch({ windows: { ...w, closeToTray: v } })} />
      </Row>
      <Row label="Session notifications" hint="Toast with playtime when a game closes.">
        <Toggle on={w.notifications !== false} label="Notifications" onChange={(v) => void onPatch({ windows: { ...w, notifications: v } })} />
      </Row>
      <div className="info-block">
        <h3>Always on</h3>
        <ul>
          <li>Taskbar jump list with your recent and most played games.</li>
          <li><code>gamelibrarian://play/&lt;launcher&gt;/&lt;id&gt;</code> protocol for scripts and shortcuts.</li>
          <li>Taskbar overlay and thumbnail Force-quit while a game runs.</li>
          <li>“Pin to Start” from any game page creates a Start menu shortcut.</li>
        </ul>
      </div>
    </section>
  )
}

function Advanced({ onToast, onRescan }: { onToast: (t: string) => void; onRescan: () => void }) {
  const [showConsole, setShowConsole] = React.useState(false)
  const [steamDebug, setSteamDebug] = React.useState<string | null>(null)
  return (
    <section>
      <h2>Advanced</h2>
      <Row label="Rescan launchers" hint="Rebuilds the fast-load cache from every detector.">
        <button className="btn btn-ghost" data-nav onClick={onRescan}>Rescan</button>
      </Row>
      <Row label="Cover cache" hint="Remove downloaded artwork. Covers re-download as needed.">
        <button className="btn btn-ghost" data-nav onClick={async () => { await api.clearCoverCache(); onToast('Cover cache cleared') }}>Clear</button>
      </Row>
      <Row label="Export logs" hint="Writes settings, playtime and a log bundle to the Logs folder.">
        <button className="btn btn-ghost" data-nav onClick={async () => { const r = await api.exportLogsBundle(); onToast(r?.ok ? `Logs exported to ${r.dir}` : 'Failed to export logs') }}>Export</button>
      </Row>
      <Row label="Reset playtime" hint="Deletes all recorded sessions. This cannot be undone.">
        <button className="btn btn-danger" data-nav onClick={async () => { if (!confirm('Reset all playtime statistics? This cannot be undone.')) return; await api.resetAllPlaytime(); onToast('Playtime reset'); onRescan() }}>Reset</button>
      </Row>
      <details className="disclosure" open={showConsole} onToggle={(e) => setShowConsole((e.target as HTMLDetailsElement).open)}>
        <summary data-nav>Developer</summary>
        <div className="dev-tools">
          <div className="dev-actions">
            <button className="btn btn-ghost btn-sm" data-nav onClick={async () => { const d = await api.debugSteam(); setSteamDebug(JSON.stringify(d, null, 2)) }}>Steam detector debug</button>
            <button className="btn btn-ghost btn-sm" data-nav onClick={async () => { try { await (window as any).debugConsoleAPI?.clear() } catch {} }}>Clear log buffer</button>
          </div>
          {steamDebug && <pre className="code-block">{steamDebug}</pre>}
          <div id="debug-console" className="console">{showConsole && <DebugConsoleView />}</div>
        </div>
      </details>
    </section>
  )
}

function About({ appVersion, onOpenChangelog }: { appVersion: string | null; onOpenChangelog: () => void }) {
  return (
    <section>
      <h2>About</h2>
      <div className="about-card">
        <div className="about-title">Game Librarian</div>
        <div className="about-version">{appVersion ? `Version ${appVersion}` : 'Version unknown'} · Open source, MIT</div>
        <div className="section-actions">
          <button className="btn btn-ghost" data-nav onClick={onOpenChangelog}>Changelog</button>
          <button className="btn btn-ghost" data-nav onClick={() => void api.openExternal('https://github.com/Maxibon13/Game-Librarian')}>GitHub</button>
        </div>
      </div>
    </section>
  )
}
