import React, { useEffect, useState } from 'react'
import { GameCard } from './GameCard'
import { SessionOverlay } from './SessionOverlay'
const sounds = {
  normal: {
    launch: new URL('../../sounds/launch.ogg', import.meta.url).href,
    open: new URL('../../sounds/open.ogg', import.meta.url).href,
    close: new URL('../../sounds/close.ogg', import.meta.url).href
  },
  alt: {
    launch: new URL('../../sounds/launch_alt.ogg', import.meta.url).href,
    open: new URL('../../sounds/open_alt.ogg', import.meta.url).href,
    close: new URL('../../sounds/close_alt.ogg', import.meta.url).href
  }
} as const
import { Settings } from './Settings'
import { SessionEndedCard } from './SessionEndedCard'
import GameMenuOverlay from './GameMenuOverlay'
import { ThemeSelect } from './ThemeSelect'
import { Changelog } from './Changelog'

export type Game = {
  id: string
  title: string
  launcher: 'steam' | 'epic' | string
  installDir?: string
  executablePath?: string
  args?: string[]
  playtimeMinutes?: number
}

export function App() {
  const [games, setGames] = useState<Game[]>([])
  const [tab, setTab] = useState<'library' | 'settings'>('library')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<{ game: Game; startedAt: number } | null>(null)
  const [starting, setStarting] = useState<{ game: Game } | null>(null)
  const [ended, setEnded] = useState<{ game: Game; durationMs: number } | null>(null)
  const [menu, setMenu] = useState<{ game: Game } | null>(null)
  const [viewMode, setViewMode] = useState<'large' | 'small' | 'list'>('large')
  const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'playtime-desc' | 'playtime-asc'>('az')
  const [query, setQuery] = useState('')
  const [modeAnim, setModeAnim] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [masterVolume, setMasterVolume] = useState(1)
  const [audioProfile, setAudioProfile] = useState<'normal' | 'alt'>('normal')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [theme, setTheme] = useState<string>('dark')
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (api?.listGames) {
      setLoading(true)
      api
        .listGames()
        .then(setGames)
        .catch(() => setGames([]))
        .finally(() => setLoading(false))
    }

    if (api?.onSessionStart) {
      api.onSessionStart((payload: any) => {
        console.log('Session started:', payload)
        setStarting(null)
        setSession(payload)
      })
    }
    if (api?.onSessionEnd) {
      api.onSessionEnd((payload: any) => {
        console.log('Session ended')
        setSession(null)
        setStarting(null)
        if (payload?.game && typeof payload?.durationMs === 'number') {
          setEnded({ game: payload.game, durationMs: payload.durationMs })
        }
      })
    }

    // Load UI/audio preferences
    if (api?.getSettings) {
      api.getSettings().then((s: any) => {
        const ui = s?.ui || {}
        if (ui.viewMode === 'large' || ui.viewMode === 'small' || ui.viewMode === 'list') {
          setViewMode(ui.viewMode)
        }
        if (ui.sort === 'az' || ui.sort === 'za' || ui.sort === 'playtime-desc' || ui.sort === 'playtime-asc') {
          setSortOrder(ui.sort)
        }
        const audio = s?.audio || {}
        setAudioEnabled(audio.enabled !== false)
        const mv = typeof audio.masterVolume === 'number' ? audio.masterVolume : 1
        setMasterVolume(Math.max(0, Math.min(1, mv)))
        if (audio.profile === 'alt' || audio.profile === 'normal') setAudioProfile(audio.profile)
        ;(window as any)._glAudioProfile = (audio.profile === 'alt' || audio.profile === 'normal') ? audio.profile : 'normal'
        // Theme
        const tn = s?.theme?.name || 'dark'
        setTheme(tn)
        applyPresetTheme(tn)
      }).catch(() => {})
    }

    // Load app version for watermark
    if (api?.getAppConfig) {
      api.getAppConfig().then((cfg: any) => {
        const v = cfg?.appVersion
        if (typeof v === 'string' && v.length > 0) setAppVersion(v)
      }).catch(() => {})
    }
  }, [])

  function applyPresetTheme(name: string) {
    const root = document.documentElement
    if (name === 'light') {
      root.style.setProperty('--bg', '#f5f6f8')
      root.style.setProperty('--panel', '#ffffff')
      root.style.setProperty('--panel-2', '#f2f4f8')
      root.style.setProperty('--text', '#0b0c10')
      root.style.setProperty('--muted', '#4a5568')
      root.style.setProperty('--brand', '#3b82f6')
      root.style.setProperty('--brand-2', '#2563eb')
      root.style.setProperty('--glow', '#60a5fa')
      root.style.setProperty('color-scheme', 'light')
    } else if (name === 'neon-blue') {
      // Brighter blues with noticeable panel gradient
      root.style.setProperty('--bg', '#101a3a')
      root.style.setProperty('--panel', '#16244d')
      root.style.setProperty('--panel-2', '#1b2b5f')
      root.style.setProperty('--text', '#eaf2ff')
      root.style.setProperty('--muted', '#bcd0ff')
      root.style.setProperty('--brand', '#39a7ff')
      root.style.setProperty('--brand-2', '#7cc8ff')
      root.style.setProperty('--glow', '#66d1ff')
      root.style.setProperty('color-scheme', 'dark')
    } else if (name === 'neon-red') {
      // Brighter reds with warm gradient
      root.style.setProperty('--bg', '#2a1014')
      root.style.setProperty('--panel', '#3a151a')
      root.style.setProperty('--panel-2', '#47181e')
      root.style.setProperty('--text', '#ffecef')
      root.style.setProperty('--muted', '#f7b3be')
      root.style.setProperty('--brand', '#ff4d6d')
      root.style.setProperty('--brand-2', '#ff7a8e')
      root.style.setProperty('--glow', '#ff8fa3')
      root.style.setProperty('color-scheme', 'dark')
    } else if (name === 'neon-green') {
      // Brighter greens with cool gradient
      root.style.setProperty('--bg', '#0f2a1a')
      root.style.setProperty('--panel', '#153a24')
      root.style.setProperty('--panel-2', '#1a4a2e')
      root.style.setProperty('--text', '#eafff3')
      root.style.setProperty('--muted', '#b8e6c9')
      root.style.setProperty('--brand', '#2bff88')
      root.style.setProperty('--brand-2', '#6affb2')
      root.style.setProperty('--glow', '#8dffca')
      root.style.setProperty('color-scheme', 'dark')
    } else if (name === 'orange-sunrise') {
      root.style.setProperty('--bg', '#120b07')
      root.style.setProperty('--panel', '#1b0f09')
      root.style.setProperty('--panel-2', '#160d0a')
      root.style.setProperty('--text', '#ffeadd')
      root.style.setProperty('--muted', '#f7c8a8')
      root.style.setProperty('--brand', '#ff8a00')
      root.style.setProperty('--brand-2', '#ff5d00')
      root.style.setProperty('--glow', '#ffb347')
      root.style.setProperty('color-scheme', 'dark')
    } else if (name === 'purple-galaxy') {
      root.style.setProperty('--bg', '#0e0a1f')
      root.style.setProperty('--panel', '#140f2b')
      root.style.setProperty('--panel-2', '#120d27')
      root.style.setProperty('--text', '#efe6ff')
      root.style.setProperty('--muted', '#c2b5e8')
      root.style.setProperty('--brand', '#8b5cf6')
      root.style.setProperty('--brand-2', '#7c3aed')
      root.style.setProperty('--glow', '#a78bfa')
      root.style.setProperty('color-scheme', 'dark')
    } else if (name === 'sea-breeze') {
      root.style.setProperty('--bg', '#081417')
      root.style.setProperty('--panel', '#0b1c21')
      root.style.setProperty('--panel-2', '#0a181d')
      root.style.setProperty('--text', '#e6fbff')
      root.style.setProperty('--muted', '#a8dbe6')
      root.style.setProperty('--brand', '#00d5ff')
      root.style.setProperty('--brand-2', '#00b0d4')
      root.style.setProperty('--glow', '#6ee7ff')
      root.style.setProperty('color-scheme', 'dark')
    } else {
      // dark default
      root.style.setProperty('--bg', '#0c0d10')
      root.style.setProperty('--panel', '#14161b')
      root.style.setProperty('--panel-2', '#171a20')
      root.style.setProperty('--text', '#e6e7eb')
      root.style.setProperty('--muted', '#b1b6c3')
      root.style.setProperty('--brand', '#6b7cff')
      root.style.setProperty('--brand-2', '#5a69e6')
      root.style.setProperty('--glow', '#3b82f6')
      root.style.setProperty('color-scheme', 'dark')
    }
  }

  function resolveActiveCustom(t: any) {
    if (t?.name === 'custom') return t
    if (typeof t?.name === 'string' && t.name.startsWith('custom:')) {
      const idx = Number(t.name.split(':')[1] || -1)
      if (Array.isArray(t?.customs) && idx >= 0 && idx < t.customs.length) {
        const picked = t.customs[idx]
        return { ...t, custom: picked?.custom, customName: picked?.customName, name: 'custom' }
      }
    }
    return t
  }

  async function saveTheme(next: any) {
    try {
      const current = await (window as any).electronAPI.getSettings()
      await (window as any).electronAPI.saveSettings({ ...current, theme: next })
    } catch {}
  }

  // Removed global UI button hover sound

  const sortedGames = React.useMemo(() => {
    const byTitle = (a: Game, b: Game) =>
      (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
    const byPlaytimeDesc = (a: Game, b: Game) => {
      const ap = Math.max(0, a.playtimeMinutes ?? 0)
      const bp = Math.max(0, b.playtimeMinutes ?? 0)
      if (bp !== ap) return bp - ap
      return byTitle(a, b)
    }
    const byPlaytimeAsc = (a: Game, b: Game) => {
      const ap = Math.max(0, a.playtimeMinutes ?? 0)
      const bp = Math.max(0, b.playtimeMinutes ?? 0)
      if (ap !== bp) return ap - bp
      return byTitle(a, b)
    }
    const filtered = query.trim().length > 0
      ? games.filter((g) => (g.title || '').toLowerCase().includes(query.trim().toLowerCase()))
      : games
    const list = filtered.slice()
    if (sortOrder === 'playtime-desc') return list.sort(byPlaytimeDesc)
    if (sortOrder === 'playtime-asc') return list.sort(byPlaytimeAsc)
    const titled = list.sort(byTitle)
    return sortOrder === 'az' ? titled : titled.reverse()
  }, [games, sortOrder, query])

  async function changeView(next: 'large' | 'small' | 'list') {
    setViewMode(next)
    setModeAnim(true)
    setTimeout(() => setModeAnim(false), 260)
    try {
      const current = await (window as any).electronAPI.getSettings()
      await (window as any).electronAPI.saveSettings({ ...current, ui: { ...(current?.ui || {}), viewMode: next } })
    } catch {}
  }

  async function changeSort(next: 'az' | 'za' | 'playtime-desc' | 'playtime-asc') {
    setSortOrder(next)
    try {
      const current = await (window as any).electronAPI.getSettings()
      await (window as any).electronAPI.saveSettings({ ...current, ui: { ...(current?.ui || {}), sort: next } })
    } catch {}
  }

  return (
    <div className={`app ${tab === 'settings' ? 'is-settings' : ''}`}>
      {session ? (
        <SessionOverlay
          game={session.game}
          startedAt={session.startedAt}
          onForceQuit={() => (window as any).electronAPI.forceQuit(session.game)}
        />
      ) : (
        <>
          <header className="header">
            <div className="left">
              <h1>Game Librarian</h1>
              <nav className="tabs">
                <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
                  Library
                </button>
                <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
                  Settings
                </button>
                <button className="" onClick={() => setShowChangelog(true)} title="Changelog">
                  Changelog
                </button>
              </nav>
            </div>
            {tab === 'library' && (
              <div className="right">
                <div className="controls">
                  <ThemeSelect
                    value={theme || 'dark'}
                    onChange={async (name) => {
                      setTheme(name)
                      applyPresetTheme(name)
                      try {
                        const current = await (window as any).electronAPI.getSettings()
                        await (window as any).electronAPI.saveSettings({ ...current, theme: { name } })
                      } catch {}
                    }}
                    options={[
                      { value: 'dark', label: 'Dark' },
                      { value: 'light', label: 'Light' },
                      { value: 'neon-blue', label: 'Neon Blue' },
                      { value: 'neon-red', label: 'Neon Red' },
                      { value: 'neon-green', label: 'Neon Green' },
                      { value: 'orange-sunrise', label: 'Orange Sunrise' },
                      { value: 'purple-galaxy', label: 'Purple Galaxy' },
                      { value: 'sea-breeze', label: 'Sea Breeze' }
                    ]}
                  />
                  <div className="group">
                    <button
                      className={viewMode === 'list' ? 'active' : ''}
                      title="List view"
                      onClick={() => changeView('list')}
                    >List</button>
                    <button
                      className={viewMode === 'small' ? 'active' : ''}
                      title="Small icons"
                      onClick={() => changeView('small')}
                    >Small</button>
                    <button
                      className={viewMode === 'large' ? 'active' : ''}
                      title="Large icons"
                      onClick={() => changeView('large')}
                    >Large</button>
                  </div>
                  <select
                    className="sort-select"
                    value={sortOrder}
                    onChange={(e) => changeSort(e.target.value as 'az' | 'za' | 'playtime-desc' | 'playtime-asc')}
                    title="Sort order"
                  >
                    <option value="az">A → Z</option>
                    <option value="za">Z → A</option>
                    <option value="playtime-desc">Most played</option>
                    <option value="playtime-asc">Least played</option>
                  </select>
                </div>
              </div>
            )}
          </header>
          {tab === 'library' && (
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search games..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search games"
              />
            </div>
          )}
          {loading && <div className="loading-bar" />}
          <div key={tab} className="view animate-fade">
            {tab === 'library' ? (
              <main className={`grid ${viewMode} ${modeAnim ? 'view-switch-in' : ''}`}>
                {sortedGames.map((g) => (
                  <GameCard
                    key={`${g.launcher}-${g.id}`}
                    game={g}
                    onLaunch={() => onLaunch(g, setStarting, audioEnabled, masterVolume, audioProfile)}
                    audioEnabled={audioEnabled}
                    masterVolume={masterVolume}
                     audioProfile={audioProfile}
                    onOpen={() => onOpenMenu(g, setMenu, audioEnabled, masterVolume, audioProfile)}
                    variant={viewMode}
                  />
                ))}
              </main>
            ) : (
              <Settings
                audio={{ enabled: audioEnabled, masterVolume }}
                audioProfile={audioProfile}
                onAudioChange={async (next) => {
                  setAudioEnabled(next.enabled)
                  setMasterVolume(next.masterVolume)
                  try {
                    const current = await (window as any).electronAPI.getSettings()
                    await (window as any).electronAPI.saveSettings({ ...current, audio: { ...(current?.audio||{}), ...next, profile: audioProfile } })
                  } catch {}
                }}
                onAudioProfileChange={async (profile) => {
                  setAudioProfile(profile)
                  ;(window as any)._glAudioProfile = profile
                  try {
                    const current = await (window as any).electronAPI.getSettings()
                    await (window as any).electronAPI.saveSettings({ ...current, audio: { ...(current?.audio||{}), enabled: audioEnabled, masterVolume, profile } })
                  } catch {}
                }}
                onSaved={async () => {
                  setLoading(true)
                  try {
                    setGames(await (window as any).electronAPI.listGames())
                  } finally {
                    setLoading(false)
                  }
                }}
              />
            )}
          </div>
        </>
      )}

      {starting && (
        <div className="session-overlay starting">
          <div className="session-content">
            <div className="session-title">Launching {starting.game.title}…</div>
            <div className="progress-bar">
              <div className="bar" />
            </div>
            <div className="session-actions">
              <span style={{ opacity: 0.8, fontSize: 12 }}>Detecting game process…</span>
            </div>
          </div>
        </div>
      )}
      {ended && (
        <SessionEndedCard
          game={ended.game}
          durationMs={ended.durationMs}
          onClose={() => setEnded(null)}
        />
      )}

      {menu && (
        <GameMenuOverlay
          game={menu.game}
          onClose={() => onCloseMenu(setMenu, audioEnabled, masterVolume, audioProfile)}
          onLaunch={() => { onLaunch(menu.game, setStarting, audioEnabled, masterVolume, audioProfile); onCloseMenu(setMenu, audioEnabled, masterVolume, audioProfile) }}
        />
      )}

      {appVersion && (
        <div className="version-watermark" aria-hidden>
          v{appVersion}
        </div>
      )}
      {showChangelog && <Changelog onClose={() => setShowChangelog(false)} />}
    </div>
  )
}

function onLaunch(
  game: Game,
  setStarting: (v: { game: Game }) => void,
  audioEnabled: boolean,
  masterVolume: number,
  profile: 'normal' | 'alt'
) {
  if (audioEnabled) {
    const src = sounds[profile]?.launch || sounds.normal.launch
    const audio = new Audio(src)
    audio.volume = 0.6 * Math.max(0, Math.min(1, masterVolume))
    audio.preload = 'auto'
    audio.play().catch(() => {})
  }
  setStarting({ game })
  return (window as any).electronAPI.launchGame(game)
}

function onOpenMenu(
  game: Game,
  setMenu: (v: { game: Game } | null) => void,
  audioEnabled: boolean,
  masterVolume: number,
  profile: 'normal' | 'alt'
) {
  try {
    if (audioEnabled) {
      const src = profile === 'alt' ? sounds.alt.open : sounds.normal.open
      const audio = new Audio(src)
      audio.volume = 0.6 * Math.max(0, Math.min(1, masterVolume))
      audio.play().catch(() => {})
    }
  } catch {}
  setMenu({ game })
}

function onCloseMenu(
  setMenu: (v: { game: Game } | null) => void,
  audioEnabled?: boolean,
  masterVolume?: number,
  profile: 'normal' | 'alt' = 'normal'
) {
  try {
    if (audioEnabled) {
      const src = profile === 'alt' ? sounds.alt.close : sounds.normal.close
      const audio = new Audio(src)
      const mv = Math.max(0, Math.min(1, masterVolume ?? 1))
      audio.volume = 0.6 * mv
      audio.play().catch(() => {})
    }
  } catch {}
  setMenu(null)
}
